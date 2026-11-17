import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { authHeaders } from '../authHeaders';

export type CurrentUser = components['schemas']['UserResponse'];

/** Profile of the session owner. */
export async function getCurrentUser(): Promise<CurrentUser> {
  const { data, response } = await api.GET('/api/users/me', { headers: await authHeaders() });
  if (!data) {
    // 2xx without a body: treat as an unusable response, not as a crash.
    throw new AppError({
      kind: 'http',
      code: 'INVALID_RESPONSE',
      status: response.status,
      retryable: false,
    });
  }
  return data;
}
