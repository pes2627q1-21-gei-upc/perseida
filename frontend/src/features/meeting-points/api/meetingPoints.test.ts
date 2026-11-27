import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { spotwiseLibrary, unvotedCafe } from '../../../../__mocks__/meetingPoints';
import { AppError } from '../../../shared/errors';
import { saveTokens } from '../../auth/tokenStorage';
import { fetchMeetingPoints } from './meetingPoints';

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

const near = { latitude: 41.4045, longitude: 2.1712 };

describe('fetchMeetingPoints (TG-352)', () => {
  it('asks /api/meeting-points for the profile and the position, and returns the points', async () => {
    const spy = mockFetch(() => jsonResponse([spotwiseLibrary, unvotedCafe]));

    await expect(fetchMeetingPoints({ profile: 'study', ...near })).resolves.toEqual([
      spotwiseLibrary,
      unvotedCafe,
    ]);
    const { url, method } = sent(spy);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/api/meeting-points');
    expect(url.searchParams.get('profile')).toBe('study');
    expect(Number(url.searchParams.get('lat'))).toBe(41.4045);
    expect(Number(url.searchParams.get('lon'))).toBe(2.1712);
  });

  it('asks for the watch party profile too', async () => {
    const spy = mockFetch(() => jsonResponse([]));

    await expect(fetchMeetingPoints({ profile: 'watch_party', ...near })).resolves.toEqual([]);

    expect(sent(spy).url.searchParams.get('profile')).toBe('watch_party');
  });

  it('sends the token of the session: the endpoint is private', async () => {
    const spy = mockFetch(() => jsonResponse([]));

    await fetchMeetingPoints({ profile: 'study', ...near });

    expect(sent(spy).request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('throws a retryable AppError when Spotwise is unavailable (criterion 5)', async () => {
    mockFetch(() => problemResponse(503, 'MEETING_POINTS_UNAVAILABLE'));

    const failure = await fetchMeetingPoints({ profile: 'study', ...near }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      code: 'MEETING_POINTS_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
  });

  it('throws a final AppError for an invalid parameter', async () => {
    mockFetch(() => problemResponse(422, 'VALIDATION_ERROR'));

    await expect(fetchMeetingPoints({ profile: 'study', ...near })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      retryable: false,
    });
  });

  it('rejects with a non-retryable INVALID_RESPONSE when a 200 comes without a body', async () => {
    mockFetch(() => new Response(null, { status: 200 }));

    const failure = await fetchMeetingPoints({ profile: 'study', ...near }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      kind: 'http',
      code: 'INVALID_RESPONSE',
      status: 200,
      retryable: false,
    });
  });
});
