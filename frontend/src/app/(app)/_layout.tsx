import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { getTokens } from '../../features/auth/tokenStorage';

/**
 * Mobile app group (ADR-0020).
 * Route guard (TG-43 #233): redirects unauthenticated users to /login.
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
      } else {
        setIsReady(true);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (!isReady) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
