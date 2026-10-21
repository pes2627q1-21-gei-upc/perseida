import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { AppError } from '../../../shared/errors';
import { logout } from '../api/logout';
import { clearTokens, getTokens } from '../tokenStorage';

/** Route param that makes the sign-in screen explain that the server did not confirm. */
export const LOGOUT_NOTICE = 'logout-unconfirmed';

/**
 * Signs out: closes the session on the server, wipes the tokens and goes to /login.
 * The device is signed out even if the server call fails (offline, expired session):
 * logout is idempotent and the stored tokens must never outlive the tap.
 */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        const tokens = await getTokens();
        if (tokens) await logout(tokens.accessToken);
      } finally {
        await clearTokens();
      }
    },
    onSettled: (_data, error) => {
      queryClient.clear();
      // An already closed or expired session (401) is the state we wanted: nothing to tell.
      const unconfirmed = error && !(error instanceof AppError && error.code === 'INVALID_SESSION');
      router.replace(
        unconfirmed ? { pathname: '/login', params: { notice: LOGOUT_NOTICE } } : '/login',
      );
    },
  });
}
