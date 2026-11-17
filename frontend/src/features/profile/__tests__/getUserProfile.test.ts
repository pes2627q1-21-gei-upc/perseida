import { AppError } from '../../../shared/errors';
import { jsonResponse, mockUserProfile, problemResponse } from '../../../../__mocks__/profile';
import { getUserProfile } from '../api/getUserProfile';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getUserProfile (TG-385 #518)', () => {
  const token = 'test-token-123';

  it('sends GET /api/users/me with Bearer authorization and returns the user profile', async () => {
    let capturedRequest: Request | undefined;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      capturedRequest = new Request(input, init);
      return jsonResponse(mockUserProfile);
    });

    const profile = await getUserProfile(token);

    expect(profile).toEqual(mockUserProfile);
    expect(capturedRequest?.headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(new URL(capturedRequest?.url ?? '').pathname).toBe('/api/users/me');
  });

  it('rejects with non-retryable AppError when response 200 has no body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));

    const error = await getUserProfile(token).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 200,
      retryable: false,
    });
  });

  it('transforms 401 problem+json into AppError INVALID_SESSION', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(401, 'INVALID_SESSION'));

    const error = await getUserProfile(token).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: 'INVALID_SESSION',
      status: 401,
      retryable: false,
    });
  });

  it('rejects with network AppError on fetch failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });

    const error = await getUserProfile(token).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      kind: 'network',
      retryable: true,
    });
  });
});
