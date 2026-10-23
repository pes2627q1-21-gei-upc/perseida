import * as SecureStore from 'expo-secure-store';

import { clearTokens, getTokens, saveTokens } from './tokenStorage';

// SecureStore is native: an in-memory map stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

afterEach(async () => {
  await clearTokens();
  jest.clearAllMocks();
});

describe('tokenStorage', () => {
  it('stores the pair in the secure storage and reads it back (US #43 criterion 4)', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    expect(await getTokens()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2);
  });

  it('returns null when there is no session on the device', async () => {
    expect(await getTokens()).toBeNull();
  });

  it('returns null if only one of the two tokens is left', async () => {
    await SecureStore.setItemAsync('perseida.accessToken', 'orphan');

    expect(await getTokens()).toBeNull();
  });

  it('clearTokens wipes both tokens (US #45 criterion 9)', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    await clearTokens();

    expect(await getTokens()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
  });

  it('clearTokens is harmless when there is nothing to wipe', async () => {
    await expect(clearTokens()).resolves.toBeUndefined();
  });
});
