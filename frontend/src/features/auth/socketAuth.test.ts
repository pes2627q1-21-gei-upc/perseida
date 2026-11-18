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
});
