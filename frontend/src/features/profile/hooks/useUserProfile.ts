import { useQuery } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import { getUserProfile, type UserProfile } from '../api/getUserProfile';

export const profileKeys = {
  me: () => ['profile', 'me'] as const,
};

/** Stale time for cached user profile (5 minutes). */
export const USER_PROFILE_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Loads the authenticated user profile from GET /api/users/me.
 * Without a stored session it fails with INVALID_SESSION (authHeaders).
 */
export function useUserProfile() {
  return useQuery<UserProfile, AppError>({
    queryKey: profileKeys.me(),
    queryFn: getUserProfile,
    staleTime: USER_PROFILE_STALE_TIME_MS,
    // One retry, and only when the error is transient (network, 408, 429, 5xx).
    retry: (failureCount, error) => failureCount < 1 && error.retryable,
  });
}
