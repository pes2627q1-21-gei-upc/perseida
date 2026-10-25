import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { getDeviceLanguage } from '../deviceLanguage';

export type TokenResponse = components['schemas']['TokenResponse'];

/**
 * Exchanges the Google ID token for Perseida application session tokens.
 * Sends the device preferred language ('ca' | 'es' | 'en') so the backend can record it
 * on the first login / account creation (ADR-0008, US #43 criteria 3 & 6).
 */
export async function signInWithGoogle(
  idToken: string,
  language: string = getDeviceLanguage(),
): Promise<TokenResponse> {
  const { data } = await api.POST('/api/auth/google', {
    body: {
      id_token: idToken,
      language,
    },
  });

  if (!data) {
    throw new AppError({
      kind: 'http',
      code: 'INVALID_RESPONSE',
      status: 200,
      retryable: false,
    });
  }

  return data;
}
