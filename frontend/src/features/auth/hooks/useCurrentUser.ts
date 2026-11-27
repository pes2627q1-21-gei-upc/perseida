import { useQuery } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import { type CurrentUser, getCurrentUser } from '../api/getCurrentUser';

export const currentUserKeys = {
  all: ['users'] as const,
  me: () => [...currentUserKeys.all, 'me'] as const,
};

/**
 * Who is signed in. The profile barely changes during a session, so it is read once; signing
 * out clears the whole cache (clearSession).
 */
export function useCurrentUser() {
  return useQuery<CurrentUser, AppError>({
    queryKey: currentUserKeys.me(),
    queryFn: getCurrentUser,
    staleTime: Infinity,
    // One retry, and only when the error is transient (network, 408, 429, 5xx).
    retry: (failureCount, error) => failureCount < 1 && error.retryable,
  });
}
