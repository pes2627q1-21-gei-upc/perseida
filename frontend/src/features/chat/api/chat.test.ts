import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makeMessage, makePage, makeRoom } from '../../../../__mocks__/chat';
import { AppError } from '../../../shared/errors';
import { _resetActiveRefreshPromise } from '../../auth/api/refreshToken';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { ensureRoom, fetchMessages, listRooms } from './chat';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

interface Call {
  method: string;
  url: URL;
  auth: string | null;
  body: string;
}

/** Records every request and answers with `respond`. */
function mockFetch(respond: (call: Call) => Response | Promise<Response>) {
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

function refreshedTokens() {
  return jsonResponse({
    access_token: 'access-2',
    refresh_token: 'refresh-2',
    token_type: 'bearer',
    expires_in: 900,
  });
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

describe('listRooms', () => {
  it('gets the rooms of the user with the session token (TG-466)', async () => {
    const rooms = [makeRoom({ last_message: makeMessage(1) })];
    const calls = mockFetch(() => jsonResponse(rooms));

    await expect(listRooms()).resolves.toEqual(rooms);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.pathname).toBe('/api/chat/rooms');
    expect(calls[0]?.auth).toBe('Bearer access-1');
  });

  it('returns an empty list when the user has no rooms', async () => {
    mockFetch(() => jsonResponse([]));

    await expect(listRooms()).resolves.toEqual([]);
  });

  it('turns a problem+json into an AppError with code, status and correlation id', async () => {
    mockFetch(() => problemResponse(403, 'FORBIDDEN'));

    const failure = await listRooms().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      correlationId: '5c0e0b8e-6d57-4f7b-9d0e-0d6a1f6f4c11',
    });
  });

  it('fails with INVALID_SESSION, without calling the API, when there is no session', async () => {
    await clearTokens();
    const calls = mockFetch(() => jsonResponse([]));

    const failure = await listRooms().catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_SESSION' });
    expect(calls).toHaveLength(0);
  });

  it('renews the session once after a 401 and repeats the request with the new token', async () => {
    const calls = mockFetch(({ url, auth }) => {
      if (url.pathname === '/api/auth/refresh') return refreshedTokens();
      return auth === 'Bearer access-2'
        ? jsonResponse([makeRoom()])
        : problemResponse(401, 'INVALID_SESSION');
    });

    await expect(listRooms()).resolves.toEqual([makeRoom()]);

    expect(calls.map((call) => call.url.pathname)).toEqual([
      '/api/chat/rooms',
      '/api/auth/refresh',
      '/api/chat/rooms',
    ]);
    expect(calls[2]?.auth).toBe('Bearer access-2');
  });

  it('fails with INVALID_RESPONSE when a 2xx answer has no data', async () => {
    mockFetch(() => new Response(null, { status: 204 }));

    const failure = await listRooms().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });
});

describe('ensureRoom', () => {
  it('opens the room of the event with PUT and no body (TG-466)', async () => {
    const room = makeRoom();
    const calls = mockFetch(() => jsonResponse(room));

    await expect(ensureRoom(EVENT_ID)).resolves.toEqual(room);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url.pathname).toBe(`/api/events/${EVENT_ID}/chat/room`);
    expect(calls[0]?.auth).toBe('Bearer access-1');
    expect(calls[0]?.body).toBe('');
  });

  it('turns EVENT_NOT_FOUND (404) into an AppError', async () => {
    mockFetch(() => problemResponse(404, 'EVENT_NOT_FOUND'));

    const failure = await ensureRoom(EVENT_ID).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'EVENT_NOT_FOUND', status: 404 });
  });

  it('fails with INVALID_SESSION, without calling the API, when there is no session', async () => {
    await clearTokens();
    const calls = mockFetch(() => jsonResponse(makeRoom()));

    const failure = await ensureRoom(EVENT_ID).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_SESSION' });
    expect(calls).toHaveLength(0);
  });

  it('fails with INVALID_RESPONSE when a 2xx answer has no data', async () => {
    mockFetch(() => new Response(null, { status: 204 }));

    const failure = await ensureRoom(EVENT_ID).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('fetchMessages', () => {
  it('asks for the first page with limit=50 and no before (TG-466)', async () => {
    const page = makePage([makeMessage(2), makeMessage(1)], 'c1');
    const calls = mockFetch(() => jsonResponse(page));

    await expect(fetchMessages(EVENT_ID)).resolves.toEqual(page);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.pathname).toBe(`/api/events/${EVENT_ID}/chat/messages`);
    expect(calls[0]?.url.searchParams.get('limit')).toBe('50');
    expect(calls[0]?.url.searchParams.has('before')).toBe(false);
    expect(calls[0]?.auth).toBe('Bearer access-1');
  });

  it('sends the cursor as before, together with limit=50', async () => {
    const calls = mockFetch(() => jsonResponse(makePage([makeMessage(1)])));

    await fetchMessages(EVENT_ID, 'c1');

    expect(calls[0]?.url.searchParams.get('before')).toBe('c1');
    expect(calls[0]?.url.searchParams.get('limit')).toBe('50');
  });

  it('encodes a cursor with special characters', async () => {
    const cursor = 'a+b/c=d&e f?g#h';
    const calls = mockFetch(() => jsonResponse(makePage([])));

    await fetchMessages(EVENT_ID, cursor);

    expect(calls[0]?.url.searchParams.get('before')).toBe(cursor);
    expect(calls[0]?.url.hash).toBe('');
  });

  it('turns CHAT_INVALID_CURSOR (422) into an AppError', async () => {
    mockFetch(() => problemResponse(422, 'CHAT_INVALID_CURSOR'));

    const failure = await fetchMessages(EVENT_ID, 'bad').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'CHAT_INVALID_CURSOR', status: 422 });
  });

  it('turns FORBIDDEN (403) into an AppError with the correlation id', async () => {
    mockFetch(() => problemResponse(403, 'FORBIDDEN'));

    const failure = await fetchMessages(EVENT_ID).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      correlationId: '5c0e0b8e-6d57-4f7b-9d0e-0d6a1f6f4c11',
    });
  });

  it('renews the session once after a 401 and repeats the request with the new token', async () => {
    const calls = mockFetch(({ url, auth }) => {
      if (url.pathname === '/api/auth/refresh') return refreshedTokens();
      return auth === 'Bearer access-2'
        ? jsonResponse(makePage([makeMessage(1)]))
        : problemResponse(401, 'INVALID_SESSION');
    });

    await expect(fetchMessages(EVENT_ID, 'c1')).resolves.toEqual(makePage([makeMessage(1)]));

    expect(calls).toHaveLength(3);
    expect(calls[2]?.auth).toBe('Bearer access-2');
    expect(calls[2]?.url.searchParams.get('before')).toBe('c1');
  });

  it('fails with INVALID_SESSION, without calling the API, when there is no session', async () => {
    await clearTokens();
    const calls = mockFetch(() => jsonResponse(makePage([])));

    const failure = await fetchMessages(EVENT_ID).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_SESSION' });
    expect(calls).toHaveLength(0);
  });

  it('fails with INVALID_RESPONSE when a 2xx answer has no data', async () => {
    mockFetch(() => new Response(null, { status: 204 }));

    const failure = await fetchMessages(EVENT_ID).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
