import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { problemResponse } from '../../../../__mocks__/apod';
import { getTokens, saveTokens } from '../tokenStorage';
import { useLogout } from './useLogout';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

// SecureStore is native: an in-memory map stands in for the device keychain.
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
  // gcTime Infinity: no 5-minute garbage-collection timer left behind after the test.
  client = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } });
  client.setQueryData(['apod'], { title: 'cached for the previous user' });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

async function signOut() {
  const { result } = await renderHook(() => useLogout(), { wrapper });
  await act(async () => {
    result.current.mutate();
  });
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  return result;
}

describe('useLogout', () => {
  it('calls the server, wipes the tokens and redirects to /login (US #45 criterion 9)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 204 }));

    await signOut();

    const request = fetchSpy.mock.calls[0][0] as Request;
    expect(request.url).toBe('http://api.test/api/auth/logout');
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(await getTokens()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('drops the cached data of the previous session', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 204 }));

    await signOut();

    expect(client.getQueryData(['apod'])).toBeUndefined();
  });

  it('still wipes the tokens and redirects when the device is offline (criterion 10)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });

    await signOut();

    expect(await getTokens()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('still wipes the tokens and redirects when the session already expired (criterion 10)', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(401, 'INVALID_SESSION'));

    await signOut();

    expect(await getTokens()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('does not call the server when there is no session on the device (criterion 10)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    await jest.requireMock('expo-secure-store').deleteItemAsync('perseida.accessToken');

    await signOut();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('still wipes the tokens and redirects when the secure storage cannot be read', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest
      .requireMock('expo-secure-store')
      .getItemAsync.mockRejectedValueOnce(new Error('storage unavailable'));

    await signOut();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await getTokens()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
