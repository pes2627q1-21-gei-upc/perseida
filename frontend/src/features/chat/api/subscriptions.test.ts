import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { makeSubscribedEvent } from '../../../../__mocks__/chat';
import { AppError } from '../../../shared/errors';
import { _resetActiveRefreshPromise } from '../../auth/api/refreshToken';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { listSubscribedEvents } from './subscriptions';

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

describe('listSubscribedEvents', () => {
  it('gets the events the user is subscribed to with the session token (TG-469)', async () => {
    const events = [makeSubscribedEvent(1), makeSubscribedEvent(2)];
    const calls = mockFetch(() => jsonResponse(events));

    await expect(listSubscribedEvents()).resolves.toEqual(events);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.pathname).toBe('/api/me/subscriptions');
    expect(calls[0]?.auth).toBe('Bearer access-1');
  });

  it('returns an empty list when the user has no subscriptions', async () => {
    mockFetch(() => jsonResponse([]));

    await expect(listSubscribedEvents()).resolves.toEqual([]);
  });

  it('turns a problem+json into an AppError with code, status and correlation id', async () => {
    mockFetch(() => problemResponse(403, 'ACCOUNT_SUSPENDED'));

    const failure = await listSubscribedEvents().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      code: 'ACCOUNT_SUSPENDED',
      status: 403,
      correlationId: '5c0e0b8e-6d57-4f7b-9d0e-0d6a1f6f4c11',
    });
  });

  it('fails with INVALID_SESSION, without calling the API, when there is no session', async () => {
    await clearTokens();
    const calls = mockFetch(() => jsonResponse([]));

    const failure = await listSubscribedEvents().catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_SESSION' });
    expect(calls).toHaveLength(0);
  });

  it('renews the session once after a 401 and repeats the request with the new token', async () => {
    const calls = mockFetch(({ url, auth }) => {
      if (url.pathname === '/api/auth/refresh') return refreshedTokens();
      return auth === 'Bearer access-2'
        ? jsonResponse([makeSubscribedEvent(1)])
        : problemResponse(401, 'INVALID_SESSION');
    });

    await expect(listSubscribedEvents()).resolves.toEqual([makeSubscribedEvent(1)]);

    expect(calls.map((call) => call.url.pathname)).toEqual([
      '/api/me/subscriptions',
      '/api/auth/refresh',
      '/api/me/subscriptions',
    ]);
    expect(calls[2]?.auth).toBe('Bearer access-2');
  });

  it('fails with INVALID_RESPONSE when a 2xx answer has no data', async () => {
    mockFetch(() => new Response(null, { status: 204 }));

    const failure = await listSubscribedEvents().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });
});
