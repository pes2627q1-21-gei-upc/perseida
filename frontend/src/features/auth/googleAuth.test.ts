import {
  AuthRequest,
  exchangeCodeAsync,
  ResponseType,
  CodeChallengeMethod,
} from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { performGoogleOAuthFlow, GOOGLE_DISCOVERY, parseJwtPayload } from './googleAuth';
import * as googleConfig from './googleConfig';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid-nonce'),
}));

jest.mock('expo-auth-session', () => ({
  AuthRequest: jest.fn(),
  exchangeCodeAsync: jest.fn(),
  ResponseType: { Code: 'code', IdToken: 'id_token' },
  CodeChallengeMethod: { S256: 'S256' },
  makeRedirectUri: jest.fn(() => 'perseida://oauth/callback'),
}));

function toBase64Url(str: string): string {
  if (typeof btoa === 'function') {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const maybeBuffer = (
    globalThis as unknown as {
      Buffer?: { from: (s: string) => { toString: (e: string) => string } };
    }
  ).Buffer;
  return maybeBuffer ? maybeBuffer.from(str).toString('base64url') : '';
}

describe('googleAuth · performGoogleOAuthFlow', () => {
  const mockPromptAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(googleConfig, 'getGoogleClientId').mockReturnValue('mock-client-id');
    jest.spyOn(googleConfig, 'getGoogleRedirectUri').mockReturnValue('perseida://oauth/callback');

    (AuthRequest as unknown as jest.Mock).mockImplementation(() => ({
      promptAsync: mockPromptAsync,
      codeVerifier: 'mock-code-verifier',
      state: 'mock-csrf-state',
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TG-43 Criteri 1: configures AuthRequest with PKCE (S256) and correct scopes', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { code: 'valid-code', state: 'mock-csrf-state' },
    });
    (exchangeCodeAsync as jest.Mock).mockResolvedValueOnce({
      idToken: 'valid-id-token',
    });

    const result = await performGoogleOAuthFlow();

    expect(AuthRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'mock-client-id',
        redirectUri: 'perseida://oauth/callback',
        responseType: ResponseType.Code,
        scopes: ['openid', 'profile', 'email'],
        usePKCE: true,
        codeChallengeMethod: CodeChallengeMethod.S256,
      }),
    );
    expect(result).toEqual({ type: 'success', idToken: 'valid-id-token' });
  });

  it('TG-43 Criteri 2: exchanges code and verifier directly with Google on successful authorization without client_secret', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { code: 'auth-code-123', state: 'mock-csrf-state' },
    });
    (exchangeCodeAsync as jest.Mock).mockResolvedValueOnce({
      idToken: 'google-id-token-xyz',
    });

    const result = await performGoogleOAuthFlow();

    expect(exchangeCodeAsync).toHaveBeenCalledWith(
      {
        clientId: 'mock-client-id',
        code: 'auth-code-123',
        redirectUri: 'perseida://oauth/callback',
        extraParams: {
          code_verifier: 'mock-code-verifier',
        },
      },
      GOOGLE_DISCOVERY,
    );
    expect(result).toEqual({ type: 'success', idToken: 'google-id-token-xyz' });
  });

  it('TG-43 Criteri 5: returns cancel when user cancels or dismisses the browser', async () => {
    mockPromptAsync.mockResolvedValueOnce({ type: 'cancel' });

    const result = await performGoogleOAuthFlow();

    expect(result).toEqual({ type: 'cancel' });
    expect(exchangeCodeAsync).not.toHaveBeenCalled();
  });

  it('TG-43 Criteri 5: returns cancel when window is dismissed', async () => {
    mockPromptAsync.mockResolvedValueOnce({ type: 'dismiss' });

    const result = await performGoogleOAuthFlow();

    expect(result).toEqual({ type: 'cancel' });
    expect(exchangeCodeAsync).not.toHaveBeenCalled();
  });

  it('TG-43 Criteri 5: returns error when auth session encounters an error', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'error',
      error: { message: 'access_denied' },
    });

    const result = await performGoogleOAuthFlow();

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error.message).toBe('access_denied');
    }
  });

  it('TG-43 Criteri 2: returns error when response state does not match request state (CSRF prevention)', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { code: 'auth-code-123', state: 'tampered-csrf-state' },
    });

    const result = await performGoogleOAuthFlow();

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error.message).toContain('Invalid state parameter');
    }
    expect(exchangeCodeAsync).not.toHaveBeenCalled();
  });

  it('TG-43 Criteri 5: returns error when Google does not return an authorization code', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { state: 'mock-csrf-state' },
    });

    const result = await performGoogleOAuthFlow();

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error.message).toContain('No authorization code');
    }
  });

  it('TG-43 Criteri 5: returns error when token exchange does not return an id_token', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { code: 'auth-code-123', state: 'mock-csrf-state' },
    });
    (exchangeCodeAsync as jest.Mock).mockResolvedValueOnce({});

    const result = await performGoogleOAuthFlow();

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error.message).toContain('did not contain an id_token');
    }
  });

  it('TG-43 Criteri 1: returns error if client ID is missing for platform', async () => {
    jest.spyOn(googleConfig, 'getGoogleClientId').mockReturnValue('');

    const result = await performGoogleOAuthFlow();

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.error.message).toContain('Google Client ID is not configured');
    }
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });

  it('TG-43 Web: uses IdToken response type with cryptographic nonce and returns id_token when valid', async () => {
    const originalOS = Platform.OS;
    try {
      Platform.OS = 'web';
      const validPayload = { nonce: 'mock-uuid-nonce', sub: 'web-user' };
      const validToken = `eyJhbGciOiJSUzI1NiJ9.${toBase64Url(JSON.stringify(validPayload))}.mock-sig`;

      mockPromptAsync.mockResolvedValueOnce({
        type: 'success',
        params: { id_token: validToken, state: 'mock-csrf-state' },
      });

      const result = await performGoogleOAuthFlow();

      expect(Crypto.randomUUID).toHaveBeenCalled();
      expect(AuthRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          responseType: 'id_token',
          usePKCE: false,
          extraParams: { nonce: 'mock-uuid-nonce' },
        }),
      );
      expect(exchangeCodeAsync).not.toHaveBeenCalled();
      expect(result).toEqual({ type: 'success', idToken: validToken });
    } finally {
      Platform.OS = originalOS;
    }
  });

  it('TG-43 Web: rejects id_token when nonce in payload does not match generated nonce', async () => {
    const originalOS = Platform.OS;
    try {
      Platform.OS = 'web';
      const mismatchPayload = { nonce: 'different-nonce', sub: 'web-user' };
      const mismatchToken = `eyJhbGciOiJSUzI1NiJ9.${toBase64Url(JSON.stringify(mismatchPayload))}.mock-sig`;

      mockPromptAsync.mockResolvedValueOnce({
        type: 'success',
        params: { id_token: mismatchToken, state: 'mock-csrf-state' },
      });

      const result = await performGoogleOAuthFlow();

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.error.message).toContain('Invalid nonce');
      }
    } finally {
      Platform.OS = originalOS;
    }
  });

  it('parseJwtPayload: safely decodes valid payload and returns null for invalid tokens', () => {
    const payload = { sub: 'user-1', name: 'Alex' };
    const validJwt = `header.${toBase64Url(JSON.stringify(payload))}.signature`;

    expect(parseJwtPayload(validJwt)).toEqual(payload);
    expect(parseJwtPayload('invalid-token')).toBeNull();
    expect(parseJwtPayload('')).toBeNull();
  });
});
