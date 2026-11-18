import { AppError } from '../../shared/errors';
import { refreshSession } from './api/refreshToken';
import { socketAuth } from './socketAuth';
import { clearTokens, saveTokens } from './tokenStorage';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

jest.mock('./api/refreshToken', () => ({
  refreshSession: jest.fn(),
  _resetActiveRefreshPromise: jest.fn(),
}));

const mockedRefreshSession = jest.mocked(refreshSession);

beforeEach(async () => {
  mockedRefreshSession.mockReset();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

describe('socketAuth: la sessió de la feature auth per a la connexió en temps real (TG-461)', () => {
  it('getToken() retorna l’access token desat', async () => {
    await expect(socketAuth.getToken()).resolves.toBe('access-1');
  });

  it('getToken() llegeix el token a cada crida (el més recent)', async () => {
    await socketAuth.getToken();
    await saveTokens({ accessToken: 'access-2', refreshToken: 'refresh-2' });

    await expect(socketAuth.getToken()).resolves.toBe('access-2');
  });

  it('getToken() retorna null si no hi ha sessió al dispositiu', async () => {
    await clearTokens();

    await expect(socketAuth.getToken()).resolves.toBeNull();
  });

  it('refresh() renova la sessió amb refreshSession() un sol cop', async () => {
    mockedRefreshSession.mockResolvedValue({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      token_type: 'bearer',
      expires_in: 900,
    });

    await socketAuth.refresh();

    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockedRefreshSession).toHaveBeenCalledWith();
  });

  it('refresh() propaga el rebuig de refreshSession()', async () => {
    const failure = new Error('refresh failed');
    mockedRefreshSession.mockRejectedValue(failure);

    await expect(socketAuth.refresh()).rejects.toBe(failure);
  });

  it('refresh() es rebutja amb SESSION_UNAVAILABLE (503, reintentable) si no renova però la sessió segueix desada', async () => {
    mockedRefreshSession.mockResolvedValue(null);

    const error: unknown = await socketAuth.refresh().then(
      () => 'resolved',
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).kind).toBe('http');
    expect((error as AppError).code).toBe('SESSION_UNAVAILABLE');
    expect((error as AppError).status).toBe(503);
    expect((error as AppError).retryable).toBe(true);
  });

  it('refresh() es resol si no renova i ja no hi ha sessió desada (llavors getToken() dona null)', async () => {
    mockedRefreshSession.mockImplementation(async () => {
      await clearTokens(); // what refreshSession does when the server rejects the session
      return null;
    });

    await socketAuth.refresh();

    await expect(socketAuth.getToken()).resolves.toBeNull();
  });
});
