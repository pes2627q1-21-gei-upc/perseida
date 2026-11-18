import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { myOuting, otherOuting } from '../../../../__mocks__/outings';
import { AppError } from '../../../shared/errors';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { createOuting, deleteOuting, getOuting, listOutings, updateOuting } from './outings';

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

const draft = {
  title: 'Perseides al Montsec',
  description: '',
  starts_at: '2099-08-12T20:00:00Z',
  ends_at: '2099-08-13T02:00:00Z',
  location: { latitude: 42.05, longitude: 0.73 },
};

describe('listOutings', () => {
  it('asks /api/outings with no filter by default', async () => {
    const spy = mockFetch(() => jsonResponse([myOuting, otherOuting]));

    await expect(listOutings({})).resolves.toEqual([myOuting, otherOuting]);
    const { url, method } = sent(spy);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/api/outings');
    expect(url.search).toBe('');
  });

  it('filters the outings of the session with mine=true', async () => {
    const spy = mockFetch(() => jsonResponse([myOuting]));

    await listOutings({ mine: true });

    expect(sent(spy).url.searchParams.get('mine')).toBe('true');
  });

  it('filters the outings of an event with event_id', async () => {
    const spy = mockFetch(() => jsonResponse([myOuting]));

    await listOutings({ eventId: 'event-1' });

    expect(sent(spy).url.searchParams.get('event_id')).toBe('event-1');
  });

  it('rejects with a non-retryable AppError when a 200 comes without a body', async () => {
    mockFetch(() => new Response(null, { status: 200 }));

    const failure = await listOutings({}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', status: 200, retryable: false });
  });
});

describe('getOuting', () => {
  it('asks /api/outings/{id}', async () => {
    const spy = mockFetch(() => jsonResponse(myOuting));

    await expect(getOuting(myOuting.id)).resolves.toEqual(myOuting);
    expect(sent(spy).url.pathname).toBe(`/api/outings/${myOuting.id}`);
  });

  it('throws the AppError of the 404', async () => {
    mockFetch(() => problemResponse(404, 'OUTING_NOT_FOUND'));

    await expect(getOuting('missing')).rejects.toMatchObject({
      code: 'OUTING_NOT_FOUND',
      status: 404,
    });
  });

  it('rejects with INVALID_RESPONSE when a 200 comes without a body', async () => {
    mockFetch(() => new Response(null, { status: 200 }));

    await expect(getOuting(myOuting.id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('createOuting', () => {
  it('posts the body to /api/outings and returns the new outing', async () => {
    const spy = mockFetch(() => jsonResponse(myOuting, 201));

    await expect(createOuting(draft)).resolves.toEqual(myOuting);
    const { url, method, request } = sent(spy);
    expect(method).toBe('POST');
    expect(url.pathname).toBe('/api/outings');
    expect(await request.json()).toEqual(draft);
  });

  it('throws the AppError of a business 422', async () => {
    mockFetch(() => problemResponse(422, 'OUTING_STARTS_IN_PAST'));

    await expect(createOuting(draft)).rejects.toMatchObject({
      code: 'OUTING_STARTS_IN_PAST',
      status: 422,
    });
  });

  it('rejects with INVALID_RESPONSE when a 201 comes without a body', async () => {
    mockFetch(() => new Response(null, { status: 201 }));

    await expect(createOuting(draft)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('updateOuting', () => {
  it('patches only the fields it is given', async () => {
    const spy = mockFetch(() => jsonResponse(myOuting));

    await expect(updateOuting(myOuting.id, { title: 'Nou', event_id: null })).resolves.toEqual(
      myOuting,
    );
    const { url, method, request } = sent(spy);
    expect(method).toBe('PATCH');
    expect(url.pathname).toBe(`/api/outings/${myOuting.id}`);
    expect(await request.json()).toEqual({ title: 'Nou', event_id: null });
  });

  it('throws the AppError of the 403', async () => {
    mockFetch(() => problemResponse(403, 'OUTING_FORBIDDEN'));

    await expect(updateOuting(myOuting.id, { title: 'x' })).rejects.toMatchObject({
      code: 'OUTING_FORBIDDEN',
    });
  });

  it('rejects with INVALID_RESPONSE when a 200 comes without a body', async () => {
    mockFetch(() => new Response(null, { status: 200 }));

    await expect(updateOuting(myOuting.id, { title: 'x' })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('deleteOuting', () => {
  it('sends a DELETE to /api/outings/{id}', async () => {
    const spy = mockFetch(() => new Response(null, { status: 204 }));

    await expect(deleteOuting(myOuting.id)).resolves.toBeUndefined();
    const { url, method } = sent(spy);
    expect(method).toBe('DELETE');
    expect(url.pathname).toBe(`/api/outings/${myOuting.id}`);
  });

  it('throws the AppError of the 403', async () => {
    mockFetch(() => problemResponse(403, 'OUTING_FORBIDDEN'));

    await expect(deleteOuting(myOuting.id)).rejects.toMatchObject({ code: 'OUTING_FORBIDDEN' });
  });
});

describe('the session', () => {
  it.each([
    ['list', () => listOutings({})],
    ['get', () => getOuting(myOuting.id)],
    ['create', () => createOuting(draft)],
    ['update', () => updateOuting(myOuting.id, { title: 'x' })],
    ['delete', () => deleteOuting(myOuting.id)],
  ])('%s sends the access token of the session as Bearer', async (_, call) => {
    const spy = mockFetch(() => jsonResponse(myOuting));

    await call();

    expect(sent(spy).request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it.each([
    ['list', () => listOutings({})],
    ['get', () => getOuting(myOuting.id)],
    ['create', () => createOuting(draft)],
    ['update', () => updateOuting(myOuting.id, { title: 'x' })],
    ['delete', () => deleteOuting(myOuting.id)],
  ])(
    '%s fails with INVALID_SESSION without calling the API when there is no session',
    async (_, call) => {
      const spy = mockFetch(() => jsonResponse(myOuting));
      await clearTokens();

      await expect(call()).rejects.toMatchObject({ code: 'INVALID_SESSION', status: 401 });
      expect(spy).not.toHaveBeenCalled();
    },
  );
});
