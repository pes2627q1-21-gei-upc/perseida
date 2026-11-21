import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent } from '../../../../__mocks__/events';
import { AppError } from '../../../shared/errors';
import type { EventSearchFilters } from '../api/getEvents';
import { useEventSearch } from './useEventSearch';
import { eventKeys } from './useEvents';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}

const ALL: EventSearchFilters = { categories: [], range: 30, near: null };
const LUNAR: EventSearchFilters = { categories: ['lunar'], range: 30, near: null };

beforeEach(() => {
  // retryDelay 0 so the single retry does not slow the tests down.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('eventKeys.search (TG-51)', () => {
  it('belongs to the events feature and changes with the filters', () => {
    expect(eventKeys.search(ALL)[0]).toBe('events');
    expect(eventKeys.search(ALL)).toEqual(eventKeys.search({ ...ALL }));
    expect(eventKeys.search(ALL)).not.toEqual(eventKeys.search(LUNAR));
    expect(eventKeys.search(ALL)).not.toEqual(eventKeys.search({ ...ALL, range: 7 }));
    expect(eventKeys.search(ALL)).not.toEqual(
      eventKeys.search({ ...ALL, near: { latitude: 41.39, longitude: 2.17 } }),
    );
  });
});

describe('useEventSearch (TG-51, criteria 6 and 8)', () => {
  it('loads the events of the filters and caches them under eventKeys.search', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse([lunarEvent]));

    const { result } = await renderHook(() => useEventSearch(ALL), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([lunarEvent]);
    expect(client.getQueryData(eventKeys.search(ALL))).toEqual([lunarEvent]);
  });

  it('asks again when the filters change', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const categories = urlOf(input).searchParams.getAll('category');
      return jsonResponse(categories.includes('lunar') ? [lunarEvent] : [launchEvent, lunarEvent]);
    });
    const { result, rerender } = await renderHook(
      ({ filters }: { filters: EventSearchFilters }) => useEventSearch(filters),
      { wrapper, initialProps: { filters: ALL } },
    );
    await waitFor(() => expect(result.current.data).toEqual([launchEvent, lunarEvent]));

    await rerender({ filters: LUNAR });

    await waitFor(() => expect(result.current.data).toEqual([lunarEvent]));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(urlOf(fetchSpy.mock.calls[1][0]).searchParams.getAll('category')).toEqual(['lunar']);
  });

  it('serves the same filters from the cache while fresh', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse([lunarEvent]));
    const first = await renderHook(() => useEventSearch(ALL), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    const second = await renderHook(() => useEventSearch({ ...ALL }), { wrapper });

    expect(second.result.current.data).toEqual([lunarEvent]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries once on a transient error and then ends in error with an AppError', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(500, 'INTERNAL_ERROR'));

    const { result } = await renderHook(() => useEventSearch(ALL), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error).toMatchObject({ code: 'INTERNAL_ERROR', retryable: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(422, 'VALIDATION_ERROR'));

    const { result } = await renderHook(() => useEventSearch(ALL), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
