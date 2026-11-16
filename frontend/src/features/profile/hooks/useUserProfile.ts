import { useQuery } from '@tanstack/react-query';

import { AppError } from '../../../shared/errors';
import { getTokens } from '../../auth/tokenStorage';
import { getUserProfile, type UserProfile } from '../api/getUserProfile';

export const profileKeys = {
  me: () => ['profile', 'me'] as const,
};

/** Stale time for cached user profile (5 minutes). */
export const USER_PROFILE_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Loads the authenticated user profile from GET /api/users/me.
 * Reads the device's secure tokens; throws INVALID_SESSION if missing or expired.
 */
export function useUserProfile() {
  return useQuery<UserProfile, AppError>({
    queryKey: profileKeys.me(),
    queryFn: async () => {
      const tokens = await getTokens();
      if (!tokens?.accessToken) {
        throw new AppError({
          kind: 'http',
          code: 'INVALID_SESSION',
          status: 401,
          retryable: false,
        });
      }
      return getUserProfile(tokens.accessToken);
    },
    staleTime: USER_PROFILE_STALE_TIME_MS,
    // One retry, and only when the error is transient (network, 408, 429, 5xx).
    retry: (failureCount, error) => failureCount < 1 && error.retryable,
  });
}
