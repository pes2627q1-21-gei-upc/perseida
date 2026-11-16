import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { isAppError } from '../../../shared/errors';
import { clearSession } from '../session';
import { getTokens, saveTokens } from '../tokenStorage';

export type TokenResponse = components['schemas']['TokenResponse'];

let activeRefreshPromise: Promise<TokenResponse | null> | null = null;

/**
 * Resets in-flight refresh state (used by test suites).
 */
export function _resetActiveRefreshPromise(): void {
  activeRefreshPromise = null;
}

/**
 * Renews the session tokens via POST /api/auth/refresh (TG-43 #233).
 *
 * Serializes concurrent renewal requests: refresh tokens are single-use,
 * so parallel calls reuse the in-flight Promise rather than firing duplicate requests.
 * If the session is invalid or expired (401 INVALID_SESSION), clears local session data.
 */
export async function refreshSession(customRefreshToken?: string): Promise<TokenResponse | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const storedTokens = await getTokens();
      const token = customRefreshToken ?? storedTokens?.refreshToken;

      if (!token) {
        await clearSession();
        return null;
      }

      const { data } = await api.POST('/api/auth/refresh', {
        body: { refresh_token: token },
      });

      if (!data) {
        return null;
      }

      // Check if session was cleared or superseded while request was in-flight (e.g. logout)
      const currentStoredTokens = await getTokens();
      if (!currentStoredTokens || currentStoredTokens.refreshToken !== token) {
        return null;
      }

      await saveTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });

      return data;
    } catch (err: unknown) {
      if (isAppError(err) && err.status === 401) {
        await clearSession();
      }
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}
