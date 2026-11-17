import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { AppError } from '../../../shared/errors';
import { clearTokens, saveTokens } from '../tokenStorage';
import { currentUserKeys, useCurrentUser } from './useCurrentUser';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

const ME = {
  id: '01a1bd9a-0000-7000-8000-0000000000aa',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  preferred_language: 'ca',
  role: 'user',
};

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

describe('useCurrentUser', () => {
  it('centralises its query key', () => {
    expect(currentUserKeys.me()).toEqual(['users', 'me']);
  });

  it('reads the profile of the session with its token', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(ME));

    const { result } = await renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe(ME.id);
    const [input, init] = fetchSpy.mock.calls[0] ?? [];
    const request = input instanceof Request ? input : new Request(input as string, init);
    expect(new URL(request.url).pathname).toBe('/api/users/me');
    expect(request.headers.get('authorization')).toBe('Bearer access-1');
  });

  it('fails with INVALID_SESSION without calling the API when there is no session', async () => {
    await clearTokens();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const { result } = await renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('INVALID_SESSION');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the problem+json as an AppError', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(problemResponse(403, 'ACCOUNT_SUSPENDED'));

    const { result } = await renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error?.code).toBe('ACCOUNT_SUSPENDED');
  });
});
