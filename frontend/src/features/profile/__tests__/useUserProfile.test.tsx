import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppError } from '../../../shared/errors';
import * as tokenStorage from '../../auth/tokenStorage';
import { jsonResponse, mockUserProfile, problemResponse } from '../../../../__mocks__/profile';
import { profileKeys, useUserProfile } from '../hooks/useUserProfile';

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const validTokens = {
  accessToken: 'valid-acc-123',
  refreshToken: 'valid-ref-123',
};

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('useUserProfile (TG-385 #518)', () => {
  it('starts loading and resolves with the user profile on success', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    const { result } = await renderHook(() => useUserProfile(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockUserProfile);
  });

  it('fails with INVALID_SESSION AppError when no tokens are present', async () => {
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(null);

    const { result } = await renderHook(() => useUserProfile(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error).toMatchObject({
      code: 'INVALID_SESSION',
      retryable: false,
    });
  });

  it('exposes a consistent centralised query key', () => {
    expect(profileKeys.me()).toEqual(['profile', 'me']);
  });

  it('refetches profile on demand', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(mockUserProfile));

    const { result } = await renderHook(() => useUserProfile(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await result.current.refetch();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('handles server 401 error as an INVALID_SESSION AppError', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(401, 'INVALID_SESSION'));

    const { result } = await renderHook(() => useUserProfile(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error).toMatchObject({
      code: 'INVALID_SESSION',
    });
  });
});
