import { EVENT_ID } from '../../../../__mocks__/posts';
import { saveTokens } from '../../auth/tokenStorage';
import { createPost, listEventPosts, updatePost } from './posts';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

/** A 2xx with no body: openapi-fetch gives no data for it. */
function emptyOk() {
  return new Response(null, { status: 200, headers: { 'Content-Length': '0' } });
}

beforeEach(async () => {
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('posts API', () => {
  it.each([
    ['list', () => listEventPosts(EVENT_ID)],
    ['create', () => createPost(EVENT_ID, 'Hola')],
    ['update', () => updatePost('01a1bd9a-0000-7000-8000-000000000001', 'Hola')],
  ])('%s fails with a final INVALID_RESPONSE when a 2xx has no body', async (_, call) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(emptyOk());

    await expect(call()).rejects.toMatchObject({
      kind: 'http',
      code: 'INVALID_RESPONSE',
      status: 200,
      retryable: false,
    });
  });
});
