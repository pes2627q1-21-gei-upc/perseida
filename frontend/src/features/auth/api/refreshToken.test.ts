import { problemResponse } from '../../../../__mocks__/apod';
import * as sessionModule from '../session';
import * as tokenStorage from '../tokenStorage';
import { _resetActiveRefreshPromise, refreshSession } from './refreshToken';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

describe('refreshSession (#233)', () => {
  const initialTokens = {
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
  };

  const refreshedResponse = {
    access_token: 'new-access-token',
    refresh_token: 'new-refresh-token',
    token_type: 'bearer' as const,
    expires_in: 900,
  };

  beforeEach(async () => {
    _resetActiveRefreshPromise();
    await tokenStorage.saveTokens(initialTokens);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    _resetActiveRefreshPromise();
    await tokenStorage.clearTokens();
    jest.restoreAllMocks();
  });

  it('exchanges existing refresh token for a new token pair and saves it', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(refreshedResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await refreshSession();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const request = fetchSpy.mock.calls[0][0] as Request;
    expect(request.url).toBe('http://api.test/api/auth/refresh');
    const body = await request.json();
    expect(body).toEqual({ refresh_token: 'old-refresh-token' });

    expect(result).toEqual(refreshedResponse);
    const saved = await tokenStorage.getTokens();
    expect(saved).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
  });

  it('serializes concurrent renewals: only sends one HTTP request', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // Small simulated async delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify(refreshedResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // Trigger three concurrent refresh calls simultaneously
    const p1 = refreshSession();
    const p2 = refreshSession();
    const p3 = refreshSession();

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(refreshedResponse);
    expect(r2).toEqual(refreshedResponse);
    expect(r3).toEqual(refreshedResponse);
  });

  it('clears session when server returns 401 INVALID_SESSION', async () => {
    const clearSessionSpy = jest.spyOn(sessionModule, 'clearSession');
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(problemResponse(401, 'INVALID_SESSION'));

    const result = await refreshSession();

    expect(result).toBeNull();
    expect(clearSessionSpy).toHaveBeenCalled();
    expect(await tokenStorage.getTokens()).toBeNull();
  });

  it('does not clear session when server returns 503 SESSION_UNAVAILABLE (ADR-0008)', async () => {
    const clearSessionSpy = jest.spyOn(sessionModule, 'clearSession');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(problemResponse(503, 'SESSION_UNAVAILABLE'));

    const result = await refreshSession();

    expect(result).toBeNull();
    expect(clearSessionSpy).not.toHaveBeenCalled();
    expect(await tokenStorage.getTokens()).toEqual(initialTokens);
  });

  it('does not clear session when network request fails (temporary network error)', async () => {
    const clearSessionSpy = jest.spyOn(sessionModule, 'clearSession');
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await refreshSession();

    expect(result).toBeNull();
    expect(clearSessionSpy).not.toHaveBeenCalled();
    expect(await tokenStorage.getTokens()).toEqual(initialTokens);
  });

  it('clears session and returns null without network call when no refresh token exists', async () => {
    await tokenStorage.clearTokens();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const clearSessionSpy = jest.spyOn(sessionModule, 'clearSession');

    const result = await refreshSession();

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(clearSessionSpy).toHaveBeenCalled();
  });
});
