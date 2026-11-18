import { jsonResponse } from '../../../__mocks__/apod';
import { createApiClient } from '../../shared/api/client';
import { registerSessionToken } from './registerSessionToken';
import { getTokens } from './tokenStorage';

jest.mock('./tokenStorage');

const mockedGetTokens = jest.mocked(getTokens);

afterEach(() => jest.restoreAllMocks());

it('makes the API client send the stored access token', async () => {
  mockedGetTokens.mockResolvedValue({ accessToken: 'stored-access', refreshToken: 'r' });
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
  registerSessionToken();

  await createApiClient('http://api.test', 1000).GET('/api/apod');

  expect((fetchSpy.mock.calls[0][0] as Request).headers.get('Authorization')).toBe(
    'Bearer stored-access',
  );
});

it('sends nothing when the device has no session', async () => {
  mockedGetTokens.mockResolvedValue(null);
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
  registerSessionToken();

  await createApiClient('http://api.test', 1000).GET('/api/apod');

  expect((fetchSpy.mock.calls[0][0] as Request).headers.has('Authorization')).toBe(false);
});
