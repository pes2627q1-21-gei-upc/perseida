import type { QueryClient } from '@tanstack/react-query';

import { queryClient as defaultQueryClient } from '../../shared/api/queryClient';
import { clearTokens } from './tokenStorage';

/**
 * Clears the stored device session tokens (both access and refresh tokens)
 * and purges the in-memory TanStack Query cache.
 *
 * Used by logout (useLogout) and by session renewal when encountering
 * a 401 INVALID_SESSION (US #43 tasks #232 & #233).
 */
export async function clearSession(customQueryClient?: QueryClient): Promise<void> {
  await clearTokens();
  const qc = customQueryClient ?? defaultQueryClient;
  qc.clear();
}
