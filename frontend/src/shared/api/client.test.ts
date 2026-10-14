import { apodImage, jsonResponse, problemResponse } from '../../../__mocks__/apod';
import { AppError } from '../errors';
import { createApiClient, fetchWithTimeout } from './client';

const BASE_URL = 'http://api.test';

function mockFetch(implementation: (request: Request, init?: RequestInit) => Promise<Response>) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => implementation(input as Request, init));
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('api client', () => {
  it('returns the parsed data on a 200', async () => {
    const fetchSpy = mockFetch(async () => jsonResponse(apodImage));
    const api = createApiClient(BASE_URL, 1000);

    const { data } = await api.GET('/api/apod');

    expect(data).toEqual(apodImage);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0][0] as Request).url).toBe(`${BASE_URL}/api/apod`);
  });

  it('throws an AppError with the server code on a problem+json response', async () => {
    mockFetch(async () => problemResponse(503, 'EXTERNAL_UNAVAILABLE'));
    const api = createApiClient(BASE_URL, 1000);

    const failure = api.GET('/api/apod');

    await expect(failure).rejects.toMatchObject({
      name: 'AppError',
      kind: 'http',
      code: 'EXTERNAL_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
  });

  it('turns a network failure into a retryable network AppError', async () => {
    mockFetch(async () => {
      throw new TypeError('Network request failed');
    });
    const api = createApiClient(BASE_URL, 1000);

    const failure = await api.GET('/api/apod').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: 'network', code: 'NETWORK_ERROR', retryable: true });
  });

  it('aborts a request that exceeds the timeout and reports a network error', async () => {
    jest.useFakeTimers();
    // The abort signal travels in the init argument added by fetchWithTimeout.
    mockFetch(
      (_request, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const api = createApiClient(BASE_URL, 5000);

    const failure = api.GET('/api/apod').catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(5000);

    expect(await failure).toMatchObject({ kind: 'network', code: 'NETWORK_ERROR' });
  });
});

describe('createApiClient', () => {
  it('fails fast when the base URL is not configured', () => {
    expect(() => createApiClient('')).toThrow('EXPO_PUBLIC_API_BASE_URL is not defined');
  });
});

describe('fetchWithTimeout', () => {
  it('clears its timer when the request finishes', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));

    await fetchWithTimeout(5000)('http://api.test/x');

    expect(jest.getTimerCount()).toBe(0);
  });
});
