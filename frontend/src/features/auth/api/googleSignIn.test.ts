import { problemResponse } from '../../../../__mocks__/apod';
import { AppError } from '../../../shared/errors';
import { signInWithGoogle } from './googleSignIn';

afterEach(() => {
  jest.restoreAllMocks();
});

const mockTokenResponse = {
  access_token: 'mock-access-token-123',
  refresh_token: 'mock-refresh-token-456',
  token_type: 'bearer' as const,
  expires_in: 900,
};

describe('googleSignIn · signInWithGoogle', () => {
  it('posts id_token and device language to /api/auth/google and returns tokens (criteria 3 & 6)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(mockTokenResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const result = await signInWithGoogle('google-id-token-abc', 'ca');

    expect(result).toEqual(mockTokenResponse);

    const request = fetchSpy.mock.calls[0][0] as Request;
    expect(request.method).toBe('POST');
    expect(request.url).toBe('http://api.test/api/auth/google');

    const body = await request.json();
    expect(body).toEqual({
      id_token: 'google-id-token-abc',
      language: 'ca',
    });
  });

  it('transforms problem+json 401 into an AppError with code INVALID_GOOGLE_TOKEN', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(401, 'INVALID_GOOGLE_TOKEN'));

    const error = await signInWithGoogle('bad-token').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_GOOGLE_TOKEN');
    expect((error as AppError).status).toBe(401);
  });

  it('transforms problem+json 403 into an AppError with code ACCOUNT_SUSPENDED', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(403, 'ACCOUNT_SUSPENDED'));

    const error = await signInWithGoogle('suspended-token').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('ACCOUNT_SUSPENDED');
    expect((error as AppError).status).toBe(403);
  });

  it('transforms problem+json 409 into an AppError with code EMAIL_ALREADY_REGISTERED', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(409, 'EMAIL_ALREADY_REGISTERED'));

    const error = await signInWithGoogle('conflict-token').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('EMAIL_ALREADY_REGISTERED');
    expect((error as AppError).status).toBe(409);
  });

  it('transforms network errors into an AppError of kind network', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });

    const error = await signInWithGoogle('token-123').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).kind).toBe('network');
  });
});
