import type { StoredTokens } from './tokenStorage';

// expo-secure-store does not exist on the web (the admin panel). Decision: the tokens live
// only in memory, so a page reload asks for the sign-in again, but a script injected in the
// page (XSS) cannot read them from localStorage or sessionStorage.
let tokens: StoredTokens | null = null;

export async function saveTokens(next: StoredTokens): Promise<void> {
  tokens = { ...next };
}

/** The pair held in memory, or null if there is no session in this tab. */
export async function getTokens(): Promise<StoredTokens | null> {
  return tokens ? { ...tokens } : null;
}

/** Removes the session from this tab. */
export async function clearTokens(): Promise<void> {
  tokens = null;
}
