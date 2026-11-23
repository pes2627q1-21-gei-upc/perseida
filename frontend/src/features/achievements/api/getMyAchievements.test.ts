import { mockAchievements } from '../../../../__mocks__/achievements';
import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { AppError } from '../../../shared/errors';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { getMyAchievements } from './getMyAchievements';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

function sentRequest(spy: jest.SpyInstance): Request {
  return spy.mock.calls[0][0] as Request;
}

beforeEach(async () => {
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(async () => {
  await clearTokens();
  jest.restoreAllMocks();
});

describe('getMyAchievements (TG-57 #564)', () => {
  it('asks GET /api/users/me/achievements with the session and returns the achievements', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(mockAchievements));

    await expect(getMyAchievements()).resolves.toEqual(mockAchievements);

    const request = sentRequest(fetchSpy);
    expect(request.method).toBe('GET');
    expect(request.url).toBe('http://api.test/api/users/me/achievements');
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('rejects with a non-retryable INVALID_RESPONSE when a 200 comes without a body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));

    const failure = await getMyAchievements().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', status: 200, retryable: false });
  });

  it('rejects with INVALID_RESPONSE when the body is not a list', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse({ code: 'primera_llum' }));

    const failure = await getMyAchievements().catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });

  it('turns a 403 problem+json into the AppError of its code', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(403, 'ACCOUNT_SUSPENDED'));

    const failure = await getMyAchievements().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'ACCOUNT_SUSPENDED', status: 403, retryable: false });
  });

  it('without a stored session fails with INVALID_SESSION and does not call the API', async () => {
    await clearTokens();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const failure = await getMyAchievements().catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_SESSION' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
