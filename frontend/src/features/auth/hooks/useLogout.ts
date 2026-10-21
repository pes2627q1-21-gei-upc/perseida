import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { logout } from '../api/logout';
import { clearTokens, getTokens } from '../tokenStorage';

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
      const tokens = await getTokens();
      try {
        if (tokens) await logout(tokens.accessToken);
      } finally {
        await clearTokens();
      }
    },
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });
}
