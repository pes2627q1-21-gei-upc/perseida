import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import {
  launchEvent,
  lunarEvent,
  meteorShowerEvent,
  solarEvent,
} from '../../../../__mocks__/events';
import { AppError } from '../../../shared/errors';
import { saveTokens } from '../../auth/tokenStorage';
import type { AstronomicalEvent } from '../api/getEvents';
import { chatKeys } from '../../chat/hooks/useChat';
import { eventKeys } from './useEvents';
import { useMySubscriptions, useToggleSubscription } from './useSubscriptions';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

type Route = (request: Request) => Response | Promise<Response>;

/** Answers the subscription endpoints, each with its own body or failure. */
function mockSubscriptionsApi(routes: { list?: Route; put?: Route; remove?: Route } = {}) {
  const list = routes.list ?? (() => jsonResponse([]));
  const put = routes.put ?? (() => new Response(null, { status: 201 }));
  const remove = routes.remove ?? (() => new Response(null, { status: 204 }));
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request;
    const { pathname } = new URL(request.url);
    if (pathname === '/api/me/subscriptions') return list(request);
    if (/^\/api\/events\/[^/]+\/subscription$/.test(pathname)) {
      if (request.method === 'PUT') return put(request);
      if (request.method === 'DELETE') return remove(request);
    }
    throw new Error(`unexpected request ${request.method} ${pathname}`);
  });
}

/** A response the test sends when it wants, to see the state in between. */
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function requestsOf(spy: jest.SpyInstance, method: string) {
  return spy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === method)
    .map((request) => new URL(request.url).pathname);
}

const cached = () => client.getQueryData<AstronomicalEvent[]>(eventKeys.subscriptions());
const ids = (events: readonly { id: string }[] | undefined) => events?.map((event) => event.id);

beforeEach(async () => {
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  // retryDelay 0 so the single retry does not slow the tests down.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('eventKeys.subscriptions (TG-53)', () => {
  it('belongs to the events feature', () => {
    expect(eventKeys.subscriptions()[0]).toBe('events');
    expect(eventKeys.subscriptions()).toEqual(eventKeys.subscriptions());
    expect(eventKeys.subscriptions()).not.toEqual(eventKeys.active());
  });
});

describe('useMySubscriptions (TG-53, criterion 7)', () => {
  it('loads the events of the session and caches them under eventKeys.subscriptions', async () => {
    mockSubscriptionsApi({ list: () => jsonResponse([lunarEvent, solarEvent]) });

    const { result } = await renderHook(() => useMySubscriptions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([lunarEvent, solarEvent]);
    expect(cached()).toEqual([lunarEvent, solarEvent]);
  });

  it('retries once on a transient error and then ends in error with an AppError', async () => {
    const spy = mockSubscriptionsApi({ list: () => problemResponse(500, 'INTERNAL_ERROR') });

    const { result } = await renderHook(() => useMySubscriptions(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('useToggleSubscription (TG-53, criterion 7)', () => {
  beforeEach(() => {
    client.setQueryData(eventKeys.subscriptions(), [lunarEvent, solarEvent]);
  });

  it('adds the event to the subscriptions at once, in order of start, before the API answers', async () => {
    const pending = deferred();
    const spy = mockSubscriptionsApi({ put: () => pending.promise });
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: launchEvent, subscribed: true });
    });

    // The launch (3 Nov) starts before the full moon (24 Nov) and the eclipse (2027).
    await waitFor(() =>
      expect(ids(cached())).toEqual([launchEvent.id, lunarEvent.id, solarEvent.id]),
    );
    expect(requestsOf(spy, 'PUT')).toEqual([`/api/events/${launchEvent.id}/subscription`]);
    await act(async () => pending.resolve(new Response(null, { status: 201 })));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('keeps the order of start when the new event goes in the middle', async () => {
    mockSubscriptionsApi({ put: () => new Promise<Response>(() => undefined) });
    client.setQueryData(eventKeys.subscriptions(), [launchEvent, lunarEvent]);
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: meteorShowerEvent, subscribed: true });
    });

    await waitFor(() =>
      expect(ids(cached())).toEqual([launchEvent.id, meteorShowerEvent.id, lunarEvent.id]),
    );
  });

  it('removes the event from the subscriptions at once, before the API answers', async () => {
    const pending = deferred();
    const spy = mockSubscriptionsApi({ remove: () => pending.promise });
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: lunarEvent, subscribed: false });
    });

    await waitFor(() => expect(ids(cached())).toEqual([solarEvent.id]));
    expect(requestsOf(spy, 'DELETE')).toEqual([`/api/events/${lunarEvent.id}/subscription`]);
    await act(async () => pending.resolve(new Response(null, { status: 204 })));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('puts the subscriptions back as they were when subscribing fails', async () => {
    mockSubscriptionsApi({ put: () => problemResponse(409, 'EVENT_ALREADY_ENDED') });
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: launchEvent, subscribed: true });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'EVENT_ALREADY_ENDED' });
    expect(ids(cached())).toEqual([lunarEvent.id, solarEvent.id]);
  });

  it('puts the event back when unsubscribing fails', async () => {
    mockSubscriptionsApi({ remove: () => problemResponse(500, 'INTERNAL_ERROR') });
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: lunarEvent, subscribed: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ids(cached())).toEqual([lunarEvent.id, solarEvent.id]);
  });

  it('asks again only when the last of several toggles ends, so a refetch does not undo the others', async () => {
    const first = deferred();
    const second = deferred();
    const answers = [first.promise, second.promise];
    const spy = mockSubscriptionsApi({ put: () => answers.shift() ?? first.promise });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: launchEvent, subscribed: true });
      result.current.mutate({ event: meteorShowerEvent, subscribed: true });
    });
    await waitFor(() => expect(requestsOf(spy, 'PUT')).toHaveLength(2));

    await act(async () => first.resolve(new Response(null, { status: 201 })));
    await waitFor(() => expect(client.isMutating()).toBe(1));
    expect(invalidate).not.toHaveBeenCalled();
    // The second toggle is still on screen while the first one has ended.
    expect(ids(cached())).toEqual([
      launchEvent.id,
      meteorShowerEvent.id,
      lunarEvent.id,
      solarEvent.id,
    ]);

    await act(async () => second.resolve(new Response(null, { status: 201 })));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    // Once for each key: the subscriptions and the rooms of the chat.
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual([eventKeys.subscriptions(), chatKeys.rooms]);
  });

  /** The PUT or DELETE of `eventId` fails with `failure`; the others wait for `pending`. */
  function failOnly(eventId: string, failure: () => Response, pending: Promise<Response>) {
    return (request: Request) => (request.url.includes(eventId) ? failure() : pending);
  }

  it('undoes only the subscribe that fails, keeping another toggle still in flight', async () => {
    const pending = deferred();
    mockSubscriptionsApi({
      put: failOnly(
        launchEvent.id,
        () => problemResponse(409, 'EVENT_ALREADY_ENDED'),
        pending.promise,
      ),
    });
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: launchEvent, subscribed: true });
      result.current.mutate({ event: meteorShowerEvent, subscribed: true });
    });

    // The launch goes away; the meteor shower, still in flight, stays.
    await waitFor(() =>
      expect(ids(cached())).toEqual([meteorShowerEvent.id, lunarEvent.id, solarEvent.id]),
    );
    await act(async () => pending.resolve(new Response(null, { status: 201 })));
  });

  it('puts back, in order, only the event whose unsubscribe fails', async () => {
    const pending = deferred();
    mockSubscriptionsApi({
      remove: failOnly(
        lunarEvent.id,
        () => problemResponse(500, 'INTERNAL_ERROR'),
        pending.promise,
      ),
      put: () => pending.promise,
    });
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: lunarEvent, subscribed: false });
      result.current.mutate({ event: launchEvent, subscribed: true });
    });

    await waitFor(() =>
      expect(ids(cached())).toEqual([launchEvent.id, lunarEvent.id, solarEvent.id]),
    );
    await act(async () => pending.resolve(new Response(null, { status: 201 })));
  });

  it('marks the rooms of the chat stale when it ends: they list the followed events', async () => {
    mockSubscriptionsApi();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: launchEvent, subscribed: true });
    });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: chatKeys.rooms }),
      ),
    );
  });

  it.each([
    ['succeeds', () => new Response(null, { status: 201 })],
    ['fails', () => problemResponse(409, 'EVENT_ALREADY_ENDED')],
  ])('marks the subscriptions stale when it %s', async (_, put) => {
    mockSubscriptionsApi({ put });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useToggleSubscription(), { wrapper });

    await act(async () => {
      result.current.mutate({ event: launchEvent, subscribed: true });
    });

    await waitFor(() => expect(result.current.isIdle).toBe(false));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: eventKeys.subscriptions() }),
      ),
    );
  });
});
