import { useQuery } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import { type Achievement, getMyAchievements } from '../api/getMyAchievements';

export const achievementKeys = {
  all: ['achievements'] as const,
  mine: () => [...achievementKeys.all, 'me'] as const,
};

/** The progress changes at most a few times a day: five minutes of cache is enough. */
export const ACHIEVEMENTS_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * The achievements of the session user with their progress (TG-58). Shared by the progress
 * cards (TG-57) and the achievements section (TG-59): both read the same cached request.
 */
export function useMyAchievements() {
  return useQuery<Achievement[], AppError>({
    queryKey: achievementKeys.mine(),
    queryFn: getMyAchievements,
    staleTime: ACHIEVEMENTS_STALE_TIME_MS,
    // One retry, and only when the error is transient (network, 408, 429, 5xx).
    retry: (failureCount, error) => failureCount < 1 && error.retryable,
  });
}
