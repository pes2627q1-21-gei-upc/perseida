import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { mockAchievements } from '../../../../__mocks__/achievements';
import { deferredResponse } from '../../../../__mocks__/pendingResponses';
import { jsonResponse, problemResponse } from '../../../../__mocks__/profile';
import * as tokenStorage from '../../auth/tokenStorage';
import { achievementKeys, useMyAchievements } from './useMyAchievements';

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  jest
    .spyOn(tokenStorage, 'getTokens')
    .mockResolvedValue({ accessToken: 'acc-1', refreshToken: 'ref-1' });
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('useMyAchievements (TG-57 #565)', () => {
  it('is loading first and then gives the achievements', async () => {
    const answer = deferredResponse();
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => answer.response);

    const { result } = await renderHook(() => useMyAchievements(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    answer.answer(jsonResponse(mockAchievements));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockAchievements);
  });

  it('retries once a transient error and then shows it', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(503, 'DATABASE_UNAVAILABLE'));

    const { result } = await renderHook(() => useMyAchievements(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'DATABASE_UNAVAILABLE', retryable: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry an error that is not transient', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(403, 'ACCOUNT_SUSPENDED'));

    const { result } = await renderHook(() => useMyAchievements(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('loads again on demand (retry button)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(mockAchievements));

    const { result } = await renderHook(() => useMyAchievements(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('shares one cache key, so the achievements section of TG-59 reuses the same request', () => {
    expect(achievementKeys.mine()).toEqual(['achievements', 'me']);
  });
});
