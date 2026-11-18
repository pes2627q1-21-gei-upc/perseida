import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import {
  createOuting,
  deleteOuting,
  getOuting,
  listOutings,
  type Outing,
  type OutingChanges,
  type OutingDraft,
  type OutingFilter,
  updateOuting,
} from '../api/outings';

export const outingKeys = {
  all: ['outings'] as const,
  list: (filter: OutingFilter) => [...outingKeys.all, 'list', filter] as const,
  detail: (id: string) => [...outingKeys.all, 'detail', id] as const,
};

// One retry, and only when the error is transient (network, 408, 429, 5xx).
function retryOnceIfTransient(failureCount: number, error: AppError): boolean {
  return failureCount < 1 && error.retryable;
}

/** The future outings of the filter. Online only. */
export function useOutings(filter: OutingFilter) {
  return useQuery<Outing[], AppError>({
    queryKey: outingKeys.list(filter),
    queryFn: () => listOutings(filter),
    retry: retryOnceIfTransient,
  });
}

export function useOuting(id: string) {
  return useQuery<Outing, AppError>({
    queryKey: outingKeys.detail(id),
    queryFn: () => getOuting(id),
    retry: retryOnceIfTransient,
  });
}

/** After any change, every list and detail is stale: they are read again when shown. */
function useRefreshOutings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: outingKeys.all });
}

export function useCreateOuting() {
  const refresh = useRefreshOutings();
  return useMutation<Outing, AppError, OutingDraft>({
    mutationFn: createOuting,
    onSuccess: refresh,
  });
}

export function useUpdateOuting(id: string) {
  const refresh = useRefreshOutings();
  return useMutation<Outing, AppError, OutingChanges>({
    mutationFn: (changes) => updateOuting(id, changes),
    onSuccess: refresh,
  });
}

export function useDeleteOuting() {
  const refresh = useRefreshOutings();
  return useMutation<void, AppError, string>({
    mutationFn: deleteOuting,
    onSuccess: refresh,
  });
}
