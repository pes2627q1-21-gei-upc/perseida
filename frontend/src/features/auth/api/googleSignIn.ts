import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
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
    throw new Error('Missing token response from auth server');
  }

  return data;
}
