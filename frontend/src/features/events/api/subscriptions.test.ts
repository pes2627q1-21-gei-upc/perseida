import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent } from '../../../../__mocks__/events';
import { AppError } from '../../../shared/errors';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { listMySubscriptions, subscribe, unsubscribe } from './subscriptions';

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

function sent(spy: jest.SpyInstance) {
  const request = spy.mock.calls[0][0] as Request;
  return { url: new URL(request.url), method: request.method, request };
}

describe('listMySubscriptions (TG-53, criterion 7)', () => {
  it('asks GET /api/me/subscriptions and returns the events of the contract', async () => {
    const spy = mockFetch(() => jsonResponse([launchEvent, lunarEvent]));

    await expect(listMySubscriptions()).resolves.toEqual([launchEvent, lunarEvent]);
    const { url, method } = sent(spy);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/api/me/subscriptions');
  });

  it('rejects with a non-retryable AppError when a 200 comes without a body', async () => {
    mockFetch(() => new Response(null, { status: 200 }));

    const failure = await listMySubscriptions().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', status: 200, retryable: false });
  });
});

describe('subscribe (TG-53, criterion 7)', () => {
  it.each([201, 200])(
    'sends a PUT to /api/events/{id}/subscription and resolves on a %i',
    async (status) => {
      const spy = mockFetch(() => new Response(null, { status }));

      await expect(subscribe(launchEvent.id)).resolves.toBeUndefined();
      const { url, method } = sent(spy);
      expect(method).toBe('PUT');
      expect(url.pathname).toBe(`/api/events/${launchEvent.id}/subscription`);
    },
  );

  it('rejects with the AppError EVENT_ALREADY_ENDED of a 409', async () => {
    mockFetch(() => problemResponse(409, 'EVENT_ALREADY_ENDED'));

    const failure = await subscribe(launchEvent.id).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'EVENT_ALREADY_ENDED', status: 409, retryable: false });
  });

  it('rejects with the AppError EVENT_NOT_FOUND of a 404', async () => {
    mockFetch(() => problemResponse(404, 'EVENT_NOT_FOUND'));

    await expect(subscribe(launchEvent.id)).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  });
});

describe('unsubscribe (TG-53, criterion 7)', () => {
  it('sends a DELETE to /api/events/{id}/subscription and resolves on a 204', async () => {
    const spy = mockFetch(() => new Response(null, { status: 204 }));

    await expect(unsubscribe(lunarEvent.id)).resolves.toBeUndefined();
    const { url, method } = sent(spy);
    expect(method).toBe('DELETE');
    expect(url.pathname).toBe(`/api/events/${lunarEvent.id}/subscription`);
  });

  it('rejects with the AppError of a server error', async () => {
    mockFetch(() => problemResponse(500, 'INTERNAL_ERROR'));

    await expect(unsubscribe(lunarEvent.id)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      retryable: true,
    });
  });
});

describe('the session (subscriptions are private)', () => {
  it.each([
    ['list', () => listMySubscriptions()],
    ['subscribe', () => subscribe(launchEvent.id)],
    ['unsubscribe', () => unsubscribe(launchEvent.id)],
  ])('%s sends the access token of the session as Bearer', async (_, call) => {
    const spy = mockFetch(() => jsonResponse([]));

    await call();

    expect(sent(spy).request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it.each([
    ['list', () => listMySubscriptions()],
    ['subscribe', () => subscribe(launchEvent.id)],
    ['unsubscribe', () => unsubscribe(launchEvent.id)],
  ])(
    '%s fails with INVALID_SESSION without calling the API when there is no session',
    async (_, call) => {
      const spy = mockFetch(() => jsonResponse([]));
      await clearTokens();

      await expect(call()).rejects.toMatchObject({ code: 'INVALID_SESSION', status: 401 });
      expect(spy).not.toHaveBeenCalled();
    },
  );
});
