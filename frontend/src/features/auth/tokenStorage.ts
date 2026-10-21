import * as SecureStore from 'expo-secure-store';

// Tokens only ever live in the device's secure storage, never in AsyncStorage (US #43, #45).
const ACCESS_TOKEN_KEY = 'perseida.accessToken';
const REFRESH_TOKEN_KEY = 'perseida.refreshToken';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens({ accessToken, refreshToken }: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

/** The stored pair, or null if there is no session on this device. */
export async function getTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

/** Removes the session from the device. Reusable by any sign-out path. */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
