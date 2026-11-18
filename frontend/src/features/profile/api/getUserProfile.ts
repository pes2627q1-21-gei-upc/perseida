import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { authHeaders } from '../../auth/authHeaders';

export type UserProfile = components['schemas']['UserResponse'];

function invalidResponse(status: number): AppError {
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

/**
 * Fetches the authenticated user profile (GET /api/users/me).
 * The session comes from authHeaders (INVALID_SESSION without one, before calling the API);
 * the other failures become AppError via errorMiddleware.
 */
export async function getUserProfile(): Promise<UserProfile> {
  const { data, response } = await api.GET('/api/users/me', { headers: await authHeaders() });
  if (!data) throw invalidResponse(response.status);
  return data;
}
