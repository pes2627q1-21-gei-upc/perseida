import { saveTokens } from '../tokenStorage';
import { getCurrentUser } from './getCurrentUser';

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

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getCurrentUser', () => {
  it('fails with a final INVALID_RESPONSE when a 2xx has no body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200, headers: { 'Content-Length': '0' } }));

    await expect(getCurrentUser()).rejects.toMatchObject({
      kind: 'http',
      code: 'INVALID_RESPONSE',
      status: 200,
      retryable: false,
    });
  });
});
