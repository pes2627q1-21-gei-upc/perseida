import { api } from '../../../shared/api/client';
import { AppError } from '../../../shared/errors';
import type { Language } from '../../../shared/i18n';
import { authHeaders } from '../../auth/authHeaders';
import type { UserProfile } from '../../profile';

/**
 * Saves the preferred language of the session owner (PATCH /api/users/me) and returns the
 * updated profile. The user comes from the session, never from the body (TG-92 criterion 2).
 * The failures (401, 422...) become AppError via errorMiddleware.
 */
export async function updateLanguage(language: Language): Promise<UserProfile> {
  const { data, response } = await api.PATCH('/api/users/me', {
    body: { preferred_language: language },
    headers: await authHeaders(),
  });
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
