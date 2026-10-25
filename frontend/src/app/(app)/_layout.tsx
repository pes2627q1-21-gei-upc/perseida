import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { refreshSession } from '../../features/auth/api/refreshToken';
import { getTokens } from '../../features/auth/tokenStorage';

/** Periodically renew tokens before the 15-minute access token expires (TG-43 #233). */
export const SESSION_REFRESH_INTERVAL_MS = 14 * 60 * 1000;

/**
 * Mobile app group (ADR-0020).
 * Route guard & session restoration (TG-43 #233):
 * - Checks session on startup and renews tokens via POST /api/auth/refresh.
 * - Redirects unauthenticated users to /login if tokens are missing or invalid (401).
 * - Periodically renews tokens while inside the app to prevent access token expiry.
 */
export default function AppLayout() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
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
      if (!currentTokens) {
        router.replace('/login');
      } else {
        setIsReady(true);
      }
    }

    checkSession();

    const interval = setInterval(async () => {
      const tokens = await getTokens();
      if (!tokens) return;
      const renewed = await refreshSession();
      if (!renewed && !(await getTokens())) {
        router.replace('/login');
      }
    }, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isReady) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
