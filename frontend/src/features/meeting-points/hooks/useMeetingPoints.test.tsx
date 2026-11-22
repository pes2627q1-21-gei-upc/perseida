import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { spotwiseLibrary } from '../../../../__mocks__/meetingPoints';
import { saveTokens } from '../../auth/tokenStorage';
import type { MeetingPointProfile } from '../api/meetingPoints';
import { useMeetingPoints } from './useMeetingPoints';

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

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

function mockFetch(response: () => Response) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
}

function searchOf(spy: jest.SpyInstance, call: number) {
  return new URL((spy.mock.calls[call][0] as Request).url).searchParams;
}

const near = { latitude: 41.4045, longitude: 2.1712 };
const far = { latitude: 42.05, longitude: 0.73 };

describe('useMeetingPoints (TG-352)', () => {
  it('asks for nothing while there is no position (criterion 1)', async () => {
    const spy = mockFetch(() => jsonResponse([spotwiseLibrary]));

    const { result } = await renderHook(() => useMeetingPoints('study', null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('loads the points of the profile around the position', async () => {
    const spy = mockFetch(() => jsonResponse([spotwiseLibrary]));

    const { result } = await renderHook(() => useMeetingPoints('study', near), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([spotwiseLibrary]);
    const search = searchOf(spy, 0);
    expect(search.get('profile')).toBe('study');
    expect(Number(search.get('lat'))).toBe(near.latitude);
    expect(Number(search.get('lon'))).toBe(near.longitude);
  });

  it('keys the query by the profile and the coordinates', async () => {
    mockFetch(() => jsonResponse([spotwiseLibrary]));

    const { result } = await renderHook(() => useMeetingPoints('watch_party', near), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.queryKey));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain('watch_party');
    expect(keys[0]).toContain(String(near.latitude));
    expect(keys[0]).toContain(String(near.longitude));
  });

  it('asks again when the profile changes', async () => {
    const spy = mockFetch(() => jsonResponse([spotwiseLibrary]));

    const { result, rerender } = await renderHook(
      ({ profile }: { profile: MeetingPointProfile }) => useMeetingPoints(profile, near),
      { wrapper, initialProps: { profile: 'study' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await rerender({ profile: 'watch_party' });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(searchOf(spy, 1).get('profile')).toBe('watch_party');
  });

  it('asks again when the position changes', async () => {
    const spy = mockFetch(() => jsonResponse([spotwiseLibrary]));

    const { result, rerender } = await renderHook(
      ({ position }: { position: typeof near }) => useMeetingPoints('study', position),
      { wrapper, initialProps: { position: near } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await rerender({ position: far });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(Number(searchOf(spy, 1).get('lat'))).toBe(far.latitude);
    expect(Number(searchOf(spy, 1).get('lon'))).toBe(far.longitude);
  });

  it('starts asking once the position arrives', async () => {
    const spy = mockFetch(() => jsonResponse([spotwiseLibrary]));

    const { result, rerender } = await renderHook(
      ({ position }: { position: typeof near | null }) => useMeetingPoints('study', position),
      { wrapper, initialProps: { position: null as typeof near | null } },
    );
    expect(spy).not.toHaveBeenCalled();

    await rerender({ position: near });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('exposes the AppError when Spotwise is unavailable (criterion 5)', async () => {
    mockFetch(() => problemResponse(503, 'MEETING_POINTS_UNAVAILABLE'));

    const { result } = await renderHook(() => useMeetingPoints('study', near), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({
      code: 'MEETING_POINTS_UNAVAILABLE',
      retryable: true,
    });
  });

  it('does not retry by itself when Spotwise is unavailable: only the retry button does', async () => {
    const spy = mockFetch(() => problemResponse(503, 'MEETING_POINTS_UNAVAILABLE'));

    const { result } = await renderHook(() => useMeetingPoints('study', near), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a final error', async () => {
    const spy = mockFetch(() => problemResponse(422, 'VALIDATION_ERROR'));

    const { result } = await renderHook(() => useMeetingPoints('study', near), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
