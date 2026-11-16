import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';

export type UserProfile = components['schemas']['UserResponse'];

function invalidResponse(status: number): AppError {
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

/**
 * Fetches the authenticated user profile (GET /api/users/me).
 * Throws AppError on failures via errorMiddleware.
 */
export async function getUserProfile(accessToken: string): Promise<UserProfile> {
  const { data, response } = await api.GET('/api/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}
