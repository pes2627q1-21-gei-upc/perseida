import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import {
  EVENT_ID,
  makeMessage,
  makePage,
  makeRoom,
  makeSubscribedEvent,
} from '../../../../__mocks__/chat';
import { AppError } from '../../../shared/errors';
import { saveTokens } from '../../auth/tokenStorage';
import { chatKeys, useMySubscriptions, useRoomMessages, useRooms } from './useChat';

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

interface Call {
  method: string;
  url: URL;
  auth: string | null;
}

/** Records every request and answers with `respond`. */
function mockFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const call = {
      method: request.method,
      url: new URL(request.url),
      auth: request.headers.get('authorization'),
    };
    calls.push(call);
    return respond(call);
  });
  return calls;
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('chatKeys', () => {
  it('centralises the query keys of the chat feature (TG-466)', () => {
    expect(chatKeys.all).toEqual(['chat']);
    expect(chatKeys.rooms).toEqual(['chat', 'rooms']);
    expect(chatKeys.subscriptions).toEqual(['chat', 'subscriptions']);
    expect(chatKeys.messages(EVENT_ID)).toEqual(['chat', 'messages', EVENT_ID]);
  });
});

describe('useRooms', () => {
  it('returns the rooms of the user', async () => {
    const rooms = [makeRoom({ last_message: makeMessage(1) })];
    const calls = mockFetch(() => jsonResponse(rooms));

    const { result } = await renderHook(() => useRooms(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rooms);
    expect(calls[0]?.url.pathname).toBe('/api/chat/rooms');
    expect(calls[0]?.auth).toBe('Bearer access-1');
  });

  it('returns an empty list when there are no rooms', async () => {
    mockFetch(() => jsonResponse([]));

    const { result } = await renderHook(() => useRooms(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns the problem+json as an AppError', async () => {
    mockFetch(() => problemResponse(403, 'FORBIDDEN'));

    const { result } = await renderHook(() => useRooms(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error?.code).toBe('FORBIDDEN');
  });

  it('retries a transient error (503) once', async () => {
    const calls = mockFetch(() => problemResponse(503, 'DATABASE_UNAVAILABLE'));

    const { result } = await renderHook(() => useRooms(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toHaveLength(2);
  });

  it('does not retry a final error (403)', async () => {
    const calls = mockFetch(() => problemResponse(403, 'FORBIDDEN'));

    const { result } = await renderHook(() => useRooms(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toHaveLength(1);
  });
});

describe('useRoomMessages', () => {
  it('loads the first page without before and with the session token', async () => {
    const calls = mockFetch(() => jsonResponse(makePage([makeMessage(2), makeMessage(1)], 'c1')));

    const { result } = await renderHook(() => useRoomMessages(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.messages).toEqual([makeMessage(2), makeMessage(1)]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe(`/api/events/${EVENT_ID}/chat/messages`);
    expect(calls[0]?.url.searchParams.has('before')).toBe(false);
    expect(calls[0]?.auth).toBe('Bearer access-1');
    expect(result.current.hasNextPage).toBe(true);
  });

  it('asks for the next page with before=<next_cursor> and keeps the pages in load order', async () => {
    const calls = mockFetch(({ url }) =>
      url.searchParams.get('before') === 'c1'
        ? jsonResponse(makePage([makeMessage(1)], null))
        : jsonResponse(makePage([makeMessage(2)], 'c1')),
    );

    const { result } = await renderHook(() => useRoomMessages(EVENT_ID), { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url.searchParams.get('before')).toBe('c1');
    expect(result.current.data?.pages.map((page) => page.messages[0])).toEqual([
      makeMessage(2),
      makeMessage(1),
    ]);
  });

  it('has no next page when next_cursor is null', async () => {
    mockFetch(() => jsonResponse(makePage([makeMessage(1)], null)));

    const { result } = await renderHook(() => useRoomMessages(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('does not duplicate pages when there is nothing more to load', async () => {
    const calls = mockFetch(() => jsonResponse(makePage([makeMessage(1)], null)));

    const { result } = await renderHook(() => useRoomMessages(EVENT_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(result.current.data?.pages).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('returns a page failure as an AppError and does not retry a final one', async () => {
    const calls = mockFetch(() => problemResponse(404, 'EVENT_NOT_FOUND'));

    const { result } = await renderHook(() => useRoomMessages(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error?.code).toBe('EVENT_NOT_FOUND');
    expect(calls).toHaveLength(1);
  });

  it('retries a transient error (503) once', async () => {
    const calls = mockFetch(() => problemResponse(503, 'DATABASE_UNAVAILABLE'));

    const { result } = await renderHook(() => useRoomMessages(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toHaveLength(2);
  });

  it('is disabled and does not call the API when the event id is empty', async () => {
    const calls = mockFetch(() => jsonResponse(makePage([])));

    const { result } = await renderHook(() => useRoomMessages(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(calls).toHaveLength(0);
  });
});

describe('useMySubscriptions', () => {
  it('returns the events the user is subscribed to (TG-469)', async () => {
    const events = [makeSubscribedEvent(1), makeSubscribedEvent(2)];
    const calls = mockFetch(() => jsonResponse(events));

    const { result } = await renderHook(() => useMySubscriptions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(events);
    expect(calls[0]?.url.pathname).toBe('/api/me/subscriptions');
    expect(calls[0]?.auth).toBe('Bearer access-1');
  });

  it('stores the answer under chatKeys.subscriptions', async () => {
    const events = [makeSubscribedEvent(1)];
    mockFetch(() => jsonResponse(events));

    const { result } = await renderHook(() => useMySubscriptions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(chatKeys.subscriptions)).toEqual(events);
  });

  it('returns the problem+json as an AppError', async () => {
    mockFetch(() => problemResponse(403, 'ACCOUNT_SUSPENDED'));

    const { result } = await renderHook(() => useMySubscriptions(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error?.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('retries a transient error (503) once', async () => {
    const calls = mockFetch(() => problemResponse(503, 'DATABASE_UNAVAILABLE'));

    const { result } = await renderHook(() => useMySubscriptions(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toHaveLength(2);
  });

  it('does not retry a final error (403)', async () => {
    const calls = mockFetch(() => problemResponse(403, 'ACCOUNT_SUSPENDED'));

    const { result } = await renderHook(() => useMySubscriptions(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toHaveLength(1);
  });
});
