import { problemResponse } from '../../../../__mocks__/apod';
import { api } from '../../../shared/api/client';
import { AppError } from '../../../shared/errors';
import { clearTokens, getTokens, saveTokens } from '../tokenStorage';
import { withSession } from './authorized';
import { _resetActiveRefreshPromise } from './refreshToken';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

const renewed = {
  access_token: 'access-2',
  refresh_token: 'refresh-2',
  token_type: 'bearer',
  expires_in: 900,
};

function unauthorized(): AppError {
  return new AppError({ kind: 'http', code: 'INVALID_SESSION', status: 401, retryable: false });
}

beforeEach(async () => {
  _resetActiveRefreshPromise();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(async () => {
  _resetActiveRefreshPromise();
  await clearTokens();
  jest.restoreAllMocks();
});

describe('withSession', () => {
  it('sends the access token of the session as a Bearer header', async () => {
    const request = jest.fn(async () => 'ok');

    await expect(withSession(request)).resolves.toBe('ok');

    expect(request).toHaveBeenCalledWith({ Authorization: 'Bearer access-1' });
  });

  it('fails with INVALID_SESSION, without calling the API, when there is no session', async () => {
    await clearTokens();
    const request = jest.fn(async () => 'ok');

    const failure = await withSession(request).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_SESSION', status: 401, retryable: false });
    expect(request).not.toHaveBeenCalled();
  });

  it('renews the session once after a 401 and retries with the new token', async () => {
    jest.spyOn(api, 'POST').mockResolvedValueOnce({
      data: renewed,
      response: new Response(null, { status: 200 }),
    } as never);
    const request = jest
      .fn<Promise<string>, [{ Authorization: string }]>()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValueOnce('ok');

    await expect(withSession(request)).resolves.toBe('ok');

    expect(request).toHaveBeenNthCalledWith(2, { Authorization: 'Bearer access-2' });
    expect(await getTokens()).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('gives back the 401 when the session cannot be renewed', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(401, 'INVALID_SESSION'));
    const request = jest.fn(async () => {
      throw unauthorized();
    });

    const failure = await withSession(request).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_SESSION', status: 401 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(await getTokens()).toBeNull();
  });

  it.each([
    [
      'the network',
      async () => {
        throw new TypeError('Network request failed');
      },
    ],
    ['a 503', async () => problemResponse(503, 'SESSION_UNAVAILABLE')],
  ])(
    'reports a retryable SESSION_UNAVAILABLE when the renewal fails because of %s',
    async (_cause, refresh) => {
      // Review of PR #96: a temporary failure must not look like an expired session.
      jest.spyOn(globalThis, 'fetch').mockImplementation(refresh);
      const request = jest.fn(async () => {
        throw unauthorized();
      });

      const failure = await withSession(request).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AppError);
      expect(failure).toMatchObject({ code: 'SESSION_UNAVAILABLE', retryable: true });
      expect(await getTokens()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    },
  );

  it('does not renew the session for other errors', async () => {
    const post = jest.spyOn(api, 'POST');
    const unavailable = new AppError({
      kind: 'http',
      code: 'SESSION_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
    const request = jest.fn(async () => {
      throw unavailable;
    });

    await expect(withSession(request)).rejects.toBe(unavailable);
    expect(post).not.toHaveBeenCalled();
  });
});
