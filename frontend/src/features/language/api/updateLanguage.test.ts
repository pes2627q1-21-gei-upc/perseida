import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { mockUserProfile } from '../../../../__mocks__/profile';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { updateLanguage } from './updateLanguage';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

beforeEach(async () => {
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => jest.restoreAllMocks());

function mockFetch(response: () => Response) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
}

describe('updateLanguage', () => {
  it('sends PATCH /api/users/me with the language and the session token, and returns the profile', async () => {
    const updated = { ...mockUserProfile, preferred_language: 'es' as const };
    const spy = mockFetch(() => jsonResponse(updated));

    await expect(updateLanguage('es')).resolves.toEqual(updated);

    const request = spy.mock.calls[0][0] as Request;
    expect(request.method).toBe('PATCH');
    expect(new URL(request.url).pathname).toBe('/api/users/me');
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
    await expect(request.json()).resolves.toEqual({ preferred_language: 'es' });
  });

  it('throws the AppError of the 422 for a language the server rejects', async () => {
    mockFetch(() => problemResponse(422, 'VALIDATION_ERROR'));

    await expect(updateLanguage('es')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
    });
  });

  it('throws the AppError of the 401 when the server rejects the session', async () => {
    mockFetch(() => problemResponse(401, 'INVALID_SESSION'));

    await expect(updateLanguage('es')).rejects.toMatchObject({
      code: 'INVALID_SESSION',
      status: 401,
    });
  });

  it('fails with INVALID_SESSION without calling the API when there is no session', async () => {
    await clearTokens();
    const spy = mockFetch(() => jsonResponse(mockUserProfile));

    await expect(updateLanguage('es')).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects with a final INVALID_RESPONSE when a 200 comes without a body', async () => {
    mockFetch(() => new Response(null, { status: 200 }));

    await expect(updateLanguage('es')).rejects.toMatchObject({
      kind: 'http',
      code: 'INVALID_RESPONSE',
      status: 200,
      retryable: false,
    });
  });
});
