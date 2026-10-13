import { useQuery } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import { type Apod, getApodToday } from '../api/getApodToday';

export const apodKeys = {
  all: ['apod'] as const,
  today: () => [...apodKeys.all, 'today'] as const,
};

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Today's APOD: it changes once a day, so it stays fresh for an hour. Online only. */
export function useApodToday() {
  return useQuery<Apod, AppError>({
    queryKey: apodKeys.today(),
    queryFn: getApodToday,
    staleTime: ONE_HOUR_MS,
    // One retry, and only when the error is transient (network, 408, 429, 5xx).
    retry: (failureCount, error) => failureCount < 1 && error.retryable,
  });
}
