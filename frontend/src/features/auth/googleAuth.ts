import {
  AuthRequest,
  CodeChallengeMethod,
  ResponseType,
  exchangeCodeAsync,
  type DiscoveryDocument,
} from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { getGoogleClientId, getGoogleRedirectUri } from './googleConfig';

export const GOOGLE_DISCOVERY: DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export type GoogleOAuthResult =
  { type: 'success'; idToken: string } | { type: 'cancel' } | { type: 'error'; error: Error };

/**
 * Safely decodes the payload of a JWT without verifying signature (verified by backend via JWKS).
 */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const json =
      typeof atob === 'function'
        ? atob(base64)
        : (
            globalThis as unknown as {
              Buffer?: { from: (s: string, enc: string) => { toString: (e: string) => string } };
            }
          ).Buffer?.from(base64, 'base64').toString('utf-8');
    if (!json) return null;
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Executes the Google OAuth2 authorization flow:
 * - On native devices (Android/iOS): RFC 7636 PKCE flow exchanging authorization code
 *   directly with Google for the id_token without client_secret.
 * - On web: OpenID Connect implicit flow (response_type=id_token) to avoid Google
 *   rejecting code exchange for public web client IDs without client_secret.
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
  const isWeb = Platform.OS === 'web';
  const webNonce = isWeb ? Crypto.randomUUID() : undefined;

  const request = new AuthRequest({
    clientId,
    scopes: ['openid', 'profile', 'email'],
    responseType: isWeb ? ResponseType.IdToken : ResponseType.Code,
    redirectUri,
    usePKCE: !isWeb,
    codeChallengeMethod: isWeb ? undefined : CodeChallengeMethod.S256,
    extraParams: webNonce ? { nonce: webNonce } : undefined,
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

  const { state } = authResponse.params;
  if (request.state && state !== request.state) {
    return { type: 'error', error: new Error('Invalid state parameter returned from Google') };
  }

  // Web platform receives id_token directly from Google authorization endpoint
  if (isWeb) {
    const idToken = authResponse.params.id_token;
    if (!idToken) {
      return {
        type: 'error',
        error: new Error('Google token response did not contain an id_token'),
      };
    }

    if (webNonce) {
      const payload = parseJwtPayload(idToken);
      if (!payload || payload.nonce !== webNonce) {
        return {
          type: 'error',
          error: new Error('Invalid nonce in Google id_token'),
        };
      }
    }

    return { type: 'success', idToken };
  }

  // Native platforms (Android/iOS): exchange code + code_verifier for id_token
  const { code } = authResponse.params;
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
