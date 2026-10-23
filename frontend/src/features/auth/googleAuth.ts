import {
  AuthRequest,
  CodeChallengeMethod,
  ResponseType,
  exchangeCodeAsync,
  type DiscoveryDocument,
} from 'expo-auth-session';

import { getGoogleClientId, getGoogleRedirectUri } from './googleConfig';

export const GOOGLE_DISCOVERY: DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export type GoogleOAuthResult =
  { type: 'success'; idToken: string } | { type: 'cancel' } | { type: 'error'; error: Error };

/**
 * Executes the RFC 7636 PKCE Google OAuth2 authorization flow:
 * 1. Generates cryptographic code_verifier, code_challenge (S256) and CSRF state.
 * 2. Launches the system browser session (ASWebAuthenticationSession / Custom Tabs).
 * 3. Validates the state parameter on redirect to prevent CSRF.
 * 4. Exchanges the authorization code + code_verifier directly with Google (public client,
 *    no client_secret) to retrieve the id_token.
 */
export async function performGoogleOAuthFlow(): Promise<GoogleOAuthResult> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return {
      type: 'error',
      error: new Error('Google Client ID is not configured for this platform.'),
    };
  }

  const redirectUri = getGoogleRedirectUri();

  const request = new AuthRequest({
    clientId,
    scopes: ['openid', 'profile', 'email'],
    responseType: ResponseType.Code,
    redirectUri,
    usePKCE: true,
    codeChallengeMethod: CodeChallengeMethod.S256,
  });

  const authResponse = await request.promptAsync(GOOGLE_DISCOVERY);

  if (authResponse.type === 'cancel' || authResponse.type === 'dismiss') {
    return { type: 'cancel' };
  }

  if (authResponse.type === 'error') {
    const errorMsg =
      authResponse.error?.message ||
      authResponse.params?.error_description ||
      authResponse.params?.error ||
      'Authentication failed';
    return { type: 'error', error: new Error(errorMsg) };
  }

  if (authResponse.type !== 'success') {
    return { type: 'error', error: new Error('Authentication failed') };
  }

  const { code, state } = authResponse.params;
  if (request.state && state !== request.state) {
    return { type: 'error', error: new Error('Invalid state parameter returned from Google') };
  }
  if (!code) {
    return { type: 'error', error: new Error('No authorization code returned from Google') };
  }

  try {
    const tokenResult = await exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: {
          code_verifier: request.codeVerifier ?? '',
        },
      },
      GOOGLE_DISCOVERY,
    );

    if (!tokenResult.idToken) {
      return {
        type: 'error',
        error: new Error('Google token response did not contain an id_token'),
      };
    }

    return { type: 'success', idToken: tokenResult.idToken };
  } catch (err) {
    return {
      type: 'error',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
