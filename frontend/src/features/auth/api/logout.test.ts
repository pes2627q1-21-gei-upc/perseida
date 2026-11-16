import { problemResponse } from '../../../../__mocks__/apod';
import { AppError } from '../../../shared/errors';
import { logout } from './logout';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('logout', () => {
  it('posts to the logout endpoint with the access token as Bearer (US #45 criterion 8)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 204 }));

    await expect(logout('access-1')).resolves.toBeUndefined();

    const request = fetchSpy.mock.calls[0][0] as Request;
    expect(request.method).toBe('POST');
    expect(request.url).toBe('http://api.test/api/auth/logout');
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('turns a problem+json failure into an AppError with its code', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(503, 'SESSION_UNAVAILABLE'));

    const error = await logout('access-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('SESSION_UNAVAILABLE');
  });

  it('turns a network failure into an AppError', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });

    const error = await logout('access-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).kind).toBe('network');
  });
});
