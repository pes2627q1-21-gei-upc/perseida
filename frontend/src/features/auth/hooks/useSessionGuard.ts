import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { refreshSession } from '../api/refreshToken';
import { getTokens } from '../tokenStorage';

/** Periodically renew tokens before the 15-minute access token expires (TG-43 #233). */
export const SESSION_REFRESH_INTERVAL_MS = 14 * 60 * 1000;

/**
 * Route guard & session restoration (TG-43 #233), shared by the mobile app and the admin panel:
 * - Checks the session on startup and renews the tokens via POST /api/auth/refresh.
 * - Sends unauthenticated users to /login if tokens are missing or invalid (401).
 * - Periodically renews the tokens while the person stays, so the access token never expires.
 * Returns true once a session is confirmed; until then the layout must draw nothing.
 */
export function useSessionGuard(): boolean {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const tokens = await getTokens();
        if (!mounted) return;
        if (!tokens) {
          router.replace('/login');
          return;
        }

        // Renew session on startup (TG-43 #233)
        // If refresh token is expired or revoked (401), clearSession() clears local tokens
        await refreshSession();
        if (!mounted) return;

        const currentTokens = await getTokens();
        if (!mounted) return;
        if (!currentTokens) {
          router.replace('/login');
        } else {
          setIsReady(true);
        }
      } catch {
        if (mounted) {
          router.replace('/login');
        }
      }
    }

    void checkSession();

    async function renewSession() {
      try {
        const tokens = await getTokens();
        if (!mounted || !tokens) return;
        const renewed = await refreshSession();
        if (!mounted || renewed) return;
        const currentTokens = await getTokens();
        if (!mounted) return;
        if (!currentTokens) {
          router.replace('/login');
        }
      } catch {
        // A transient failure must not invalidate the session; retry at the next interval.
      }
    }

    const interval = setInterval(() => {
      void renewSession();
    }, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return isReady;
}
