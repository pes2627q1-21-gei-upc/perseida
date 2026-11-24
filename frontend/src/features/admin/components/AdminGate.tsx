import { useRouter } from 'expo-router';
import { type ReactNode, useEffect } from 'react';

import { useSessionGuard } from '../../auth/hooks/useSessionGuard';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { clearTokens } from '../../auth/tokenStorage';
import { canAccessAdmin } from '../canAccessAdmin';
import { NoAccessScreen } from './NoAccessScreen';

function RoleGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: user, isError } = useCurrentUser();

  useEffect(() => {
    if (!isError) return;
    // The tokens go too: /login sends a person who still has them straight back to the panel.
    void clearTokens().finally(() => router.replace('/login'));
  }, [isError, router]);

  if (!user) return null;
  return canAccessAdmin(user.role) ? children : <NoAccessScreen />;
}

/**
 * Door of the admin panel (TG-77 criteris 3 i 4): no session goes to /login, an admin or a
 * moderator gets in, and any other account sees «sense accés». Draws nothing until it knows.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const isReady = useSessionGuard();
  // The profile is only asked for once the session is confirmed (and renewed).
  return isReady ? <RoleGate>{children}</RoleGate> : null;
}
