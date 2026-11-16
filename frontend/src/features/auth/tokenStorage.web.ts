import type { StoredTokens } from './tokenStorage';

// expo-secure-store does not exist on the web (the admin panel). Decision: the tokens live
// in sessionStorage, so they survive a page reload but die with the tab (never localStorage:
// they would outlive the browser session). The trade-off is that a script injected in the
// page (XSS) could read them; the admin must not load third-party scripts, and the
// alternative, an httpOnly cookie, needs a backend change (see ADR-0008).
const ACCESS_TOKEN_KEY = 'perseida.accessToken';
const REFRESH_TOKEN_KEY = 'perseida.refreshToken';

// Used when sessionStorage is not available (blocked by the browser, private modes):
// the session then lives in memory and a reload asks for the sign-in again.
let memory: StoredTokens | null = null;

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  const store = storage();
  try {
    store?.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    store?.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } catch {
    // Quota or blocked storage: the in-memory copy below keeps the session alive.
  }
  memory = { ...tokens };
}

/** The stored pair, or null if there is no session in this tab. */
export async function getTokens(): Promise<StoredTokens | null> {
  try {
    const store = storage();
    const accessToken = store?.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = store?.getItem(REFRESH_TOKEN_KEY);
    if (accessToken && refreshToken) return { accessToken, refreshToken };
  } catch {
    // Fall back to memory.
  }
  return memory ? { ...memory } : null;
}

/** Removes the session from this tab. */
export async function clearTokens(): Promise<void> {
  memory = null;
  try {
    const store = storage();
    store?.removeItem(ACCESS_TOKEN_KEY);
    store?.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing else to wipe.
  }
}
