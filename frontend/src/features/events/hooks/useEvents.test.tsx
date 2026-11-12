import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { AppError } from '../../../shared/errors';
import {
  MAP_UPCOMING_DAYS,
  eventKeys,
  useActiveEvents,
  useMapEvents,
  useUpcomingEvents,
} from './useEvents';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}

/** Answers each events endpoint with its own body or failure. */
function mockEventsApi(routes: { active: () => Response; upcoming: () => Response }) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = urlOf(input);
    if (pathname === '/api/events/active') return routes.active();
    if (pathname === '/api/events/upcoming') return routes.upcoming();
    throw new Error(`unexpected request to ${pathname}`);
  });
}

beforeEach(() => {
  // retryDelay 0 so the single retry does not slow the tests down.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('eventKeys', () => {
  it('centralises the query keys of the events feature', () => {
    expect(eventKeys.active()).toEqual(['events', 'active']);
    expect(eventKeys.upcoming(30)).toEqual(['events', 'upcoming', 30]);
  });
});

describe('useActiveEvents', () => {
  it('starts loading and then returns the active events', async () => {
    mockEventsApi({
      active: () => jsonResponse([meteorShowerEvent]),
      upcoming: () => jsonResponse([]),
    });

    const { result } = await renderHook(() => useActiveEvents(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([meteorShowerEvent]);
  });

  it('retries once on a transient error and then ends in error with an AppError', async () => {
    const fetchSpy = mockEventsApi({
      active: () => problemResponse(500, 'INTERNAL_ERROR'),
      upcoming: () => jsonResponse([]),
    });

    const { result } = await renderHook(() => useActiveEvents(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error).toMatchObject({ code: 'INTERNAL_ERROR', retryable: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    const fetchSpy = mockEventsApi({
      active: () => problemResponse(422, 'VALIDATION_ERROR'),
      upcoming: () => jsonResponse([]),
    });

    const { result } = await renderHook(() => useActiveEvents(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useUpcomingEvents', () => {
  it('returns the events of the next days and serves them from the cache while fresh', async () => {
    const fetchSpy = mockEventsApi({
      active: () => jsonResponse([]),
      upcoming: () => jsonResponse([lunarEvent]),
    });
    const first = await renderHook(() => useUpcomingEvents(30), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    const second = await renderHook(() => useUpcomingEvents(30), { wrapper });

    expect(second.result.current.data).toEqual([lunarEvent]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(urlOf(fetchSpy.mock.calls[0][0]).searchParams.get('days')).toBe('30');
  });
});

describe('useMapEvents', () => {
  it('asks for the upcoming events of the next 30 days', () => {
    expect(MAP_UPCOMING_DAYS).toBe(30);
  });

  it('classifies active and upcoming events once both have loaded', async () => {
    mockEventsApi({
      active: () => jsonResponse([launchEvent, meteorShowerEvent]),
      upcoming: () => jsonResponse([launchEvent, lunarEvent]),
    });

    const { result } = await renderHook(() => useMapEvents(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.active.map((event) => event.id)).toEqual([
      launchEvent.id,
      meteorShowerEvent.id,
    ]);
    expect(result.current.data?.upcoming.map((event) => event.id)).toEqual([lunarEvent.id]);
    expect(result.current.data?.all).toHaveLength(3);
  });

  it('ends in error when one of the two requests fails', async () => {
    mockEventsApi({
      active: () => jsonResponse([meteorShowerEvent]),
      upcoming: () => problemResponse(422, 'VALIDATION_ERROR'),
    });

    const { result } = await renderHook(() => useMapEvents(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('refetch loads the failed data again (retry button)', async () => {
    let upcomingCalls = 0;
    mockEventsApi({
      active: () => jsonResponse([meteorShowerEvent]),
      upcoming: () => {
        upcomingCalls += 1;
        return upcomingCalls === 1
          ? problemResponse(422, 'VALIDATION_ERROR')
          : jsonResponse([lunarEvent]);
      },
    });
    const { result } = await renderHook(() => useMapEvents(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    await result.current.refetch();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.all.map((event) => event.id)).toEqual([
      meteorShowerEvent.id,
      lunarEvent.id,
    ]);
  });
});
