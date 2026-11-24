import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { AppError } from '../../../shared/errors';
import { _resetActiveRefreshPromise } from '../../auth/api/refreshToken';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import {
  blockUser,
  fetchMessages,
  listConversations,
  markRead,
  openConversation,
  unblockUser,
} from './directChat';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

const ME = '01900000-0000-7000-8000-000000000001';
const OTHER = '01900000-0000-7000-8000-000000000002';
const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const conversation = {
  id: CONVERSATION,
  user_a_id: ME,
  user_b_id: OTHER,
  created_at: '2026-11-22T12:00:00Z',
};
const message = {
  id: '01900000-0000-7000-8000-000000000004',
  conversation_id: CONVERSATION,
  sender_id: OTHER,
  text: 'Hola',
  sent_at: '2026-11-22T12:00:00Z',
};
const overview = {
  conversation_id: CONVERSATION,
  other_user_id: OTHER,
  other_display_name: 'Pau',
  other_avatar_url: 'https://example.org/avatar.png',
  last_message_preview: 'Hola',
  last_message_at: message.sent_at,
  last_message_sender_id: OTHER,
  unread_count: 1,
  blocked_by_me: false,
  created_at: conversation.created_at,
};

type Call = { method: string; url: URL; auth: string | null; body: string };
function mockFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const call = {
      method: request.method,
      url: new URL(request.url),
      auth: request.headers.get('authorization'),
      body: await request.text(),
    };
    calls.push(call);
    return respond(call);
  });
  return calls;
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

describe('direct chat API (TG-65)', () => {
  it.each([200, 201])('opens a new or existing conversation (%i)', async (status) => {
    const calls = mockFetch(
      () =>
        new Response(JSON.stringify(conversation), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(openConversation(OTHER)).resolves.toEqual(conversation);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      auth: 'Bearer access-1',
    });
    expect(calls[0]?.url.pathname).toBe('/api/direct-conversations');
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ user_id: OTHER });
  });

  it.each([
    [404, 'USER_NOT_FOUND'],
    [422, 'CANNOT_MESSAGE_SELF'],
  ] as const)('preserves error %s %s', async (status, code) => {
    mockFetch(() => problemResponse(status, code));
    const error: unknown = await openConversation(OTHER).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status, code });
  });

  it('returns the authenticated conversation list and unread counts', async () => {
    const calls = mockFetch(() => jsonResponse([overview]));
    await expect(listConversations()).resolves.toEqual([overview]);
    expect(calls[0]).toMatchObject({ method: 'GET', auth: 'Bearer access-1' });
    expect(calls[0]?.url.pathname).toBe('/api/direct-conversations');
  });

  it('preserves null profile and last-message fields for an empty conversation', async () => {
    const empty = {
      ...overview,
      other_display_name: null,
      other_avatar_url: null,
      last_message_preview: null,
      last_message_at: null,
      last_message_sender_id: null,
      unread_count: 0,
    };
    mockFetch(() => jsonResponse([empty]));
    await expect(listConversations()).resolves.toEqual([empty]);
  });

  it('requests history with the cursor encoded and returns the page unchanged', async () => {
    const page = { messages: [message], next_cursor: 'next' };
    const calls = mockFetch(() => jsonResponse(page));
    await expect(fetchMessages(CONVERSATION, 'a+b/c=d&e')).resolves.toEqual(page);
    expect(calls[0]?.url.pathname).toBe(`/api/direct-conversations/${CONVERSATION}/messages`);
    expect(calls[0]?.url.searchParams.get('limit')).toBe('50');
    expect(calls[0]?.url.searchParams.get('before')).toBe('a+b/c=d&e');
  });

  it('requests the first history page without a cursor', async () => {
    const calls = mockFetch(() => jsonResponse({ messages: [], next_cursor: null }));
    await fetchMessages(CONVERSATION);
    expect(calls[0]?.url.searchParams.get('limit')).toBe('50');
    expect(calls[0]?.url.searchParams.has('before')).toBe(false);
  });

  it('preserves CONVERSATION_NOT_FOUND from history', async () => {
    mockFetch(() => problemResponse(404, 'CONVERSATION_NOT_FOUND'));
    await expect(fetchMessages(CONVERSATION)).rejects.toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
      status: 404,
    });
  });

  it.each([
    ['POST', `/api/direct-conversations/${CONVERSATION}/read`, () => markRead(CONVERSATION)],
    ['PUT', `/api/users/${OTHER}/block`, () => blockUser(OTHER)],
    ['DELETE', `/api/users/${OTHER}/block`, () => unblockUser(OTHER)],
  ] as const)('accepts a bodyless 204 for %s %s', async (method, path, request) => {
    const calls = mockFetch(() => new Response(null, { status: 204 }));
    await expect(request()).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      method,
      auth: 'Bearer access-1',
      body: '',
    });
    expect(calls[0]?.url.pathname).toBe(path);
  });

  it('makes no request without a session', async () => {
    await clearTokens();
    const calls = mockFetch(() => jsonResponse([]));
    await expect(listConversations()).rejects.toMatchObject({
      code: 'INVALID_SESSION',
    });
    expect(calls).toHaveLength(0);
  });

  it('refreshes an expired session and retries the history request once', async () => {
    const calls = mockFetch(({ url, auth }) => {
      if (url.pathname === '/api/auth/refresh') {
        return jsonResponse({
          access_token: 'access-2',
          refresh_token: 'refresh-2',
          token_type: 'bearer',
          expires_in: 900,
        });
      }
      return auth === 'Bearer access-2'
        ? jsonResponse({ messages: [message], next_cursor: null })
        : problemResponse(401, 'INVALID_SESSION');
    });
    await expect(fetchMessages(CONVERSATION, 'cursor')).resolves.toEqual({
      messages: [message],
      next_cursor: null,
    });
    expect(calls.map((call) => call.url.pathname)).toEqual([
      `/api/direct-conversations/${CONVERSATION}/messages`,
      '/api/auth/refresh',
      `/api/direct-conversations/${CONVERSATION}/messages`,
    ]);
    expect(calls[2]?.auth).toBe('Bearer access-2');
    expect(calls[2]?.url.searchParams.get('before')).toBe('cursor');
  });

  it('returns an INVALID_RESPONSE error for a missing list body', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(listConversations()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retryable: false,
    });
  });

  it('preserves errors from a rejected block request', async () => {
    mockFetch(() => problemResponse(404, 'USER_NOT_FOUND'));
    await expect(blockUser(OTHER)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      status: 404,
    });
  });
});

describe('TG-65 criteria 9 and 10: invalid successful API responses', () => {
  it.each([
    ['open conversation', () => openConversation(OTHER)],
    ['conversation list', () => listConversations()],
    ['message history', () => fetchMessages(CONVERSATION)],
  ] as const)('rejects a null %s response with a stable error', async (_name, request) => {
    mockFetch(() => jsonResponse(null));
    await expect(request()).rejects.toMatchObject({
      kind: 'http',
      code: 'INVALID_RESPONSE',
      status: 200,
      retryable: false,
    });
  });
});
