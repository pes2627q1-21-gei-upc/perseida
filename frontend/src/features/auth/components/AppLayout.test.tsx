import { act, render, waitFor } from '@testing-library/react-native';

import AppLayout, { SESSION_REFRESH_INTERVAL_MS } from '../../../app/(app)/_layout';
import * as refreshTokenModule from '../api/refreshToken';
import * as tokenStorage from '../tokenStorage';

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: () => null,
}));

describe('AppLayout Route Guard & Session Renewal (TG-43 #233)', () => {
  const validTokens = {
    accessToken: 'valid-acc',
    refreshToken: 'valid-ref',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('redirects unauthenticated users to /login without calling refreshSession', async () => {
    const refreshSpy = jest.spyOn(refreshTokenModule, 'refreshSession');
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(null);

    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('renews session on startup and allows access when valid tokens exist', async () => {
    const refreshSpy = jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue({
      access_token: 'new-acc',
      refresh_token: 'new-ref',
      token_type: 'bearer',
      expires_in: 900,
    });
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);

    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('redirects to /login when session renewal detects an expired or revoked session (401)', async () => {
    let hasTokens = true;
    jest.spyOn(refreshTokenModule, 'refreshSession').mockImplementation(async () => {
      hasTokens = false;
      return null;
    });
    jest
      .spyOn(tokenStorage, 'getTokens')
      .mockImplementation(async () => (hasTokens ? validTokens : null));

    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('allows access and does not redirect when renewal encounters network failure (offline mode)', async () => {
    // Network failure: refreshSession returns null but tokens remain in storage
    const refreshSpy = jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue(null);
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);

    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('periodically renews tokens while inside the app', async () => {
    jest.useFakeTimers();
    const refreshSpy = jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue({
      access_token: 'new-acc',
      refresh_token: 'new-ref',
      token_type: 'bearer',
      expires_in: 900,
    });
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);

    await act(async () => {
      render(<AppLayout />);
    });

    expect(refreshSpy).toHaveBeenCalledTimes(1);

    // Fast-forward 14 minutes
    await act(async () => {
      jest.advanceTimersByTime(SESSION_REFRESH_INTERVAL_MS);
    });

    expect(refreshSpy).toHaveBeenCalledTimes(2);
  });

  it('TG-536 keeps a valid session when periodic renewal rejects', async () => {
    jest.useFakeTimers();
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);
    const refresh = jest
      .spyOn(refreshTokenModule, 'refreshSession')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('transient failure'));
    await act(async () => {
      render(<AppLayout />);
    });
    await act(async () => {
      jest.advanceTimersByTime(SESSION_REFRESH_INTERVAL_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('TG-536 does not redirect after unmount while checking restored tokens', async () => {
    let finish!: (value: null) => void;
    jest
      .spyOn(tokenStorage, 'getTokens')
      .mockResolvedValueOnce(validTokens)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue(null);
    const view = await render(<AppLayout />);
    await act(async () => {});
    await view.unmount();
    await act(async () => {
      finish(null);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each(['initial read', 'final read'])(
    'TG-536 catches periodic %s failure and retains the session',
    async (failedRead) => {
      jest.useFakeTimers();
      const getTokens = jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);
      jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue(null);
      await act(async () => {
        render(<AppLayout />);
      });
      if (failedRead === 'final read') getTokens.mockResolvedValueOnce(validTokens);
      getTokens.mockRejectedValueOnce(new Error('storage'));
      await act(async () => {
        jest.advanceTimersByTime(SESSION_REFRESH_INTERVAL_MS);
      });
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );

  it('TG-536 redirects on periodic revoked session', async () => {
    jest.useFakeTimers();
    const getTokens = jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);
    jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue(null);
    await act(async () => {
      render(<AppLayout />);
    });
    getTokens.mockResolvedValueOnce(validTokens).mockResolvedValueOnce(null);
    await act(async () => {
      jest.advanceTimersByTime(SESSION_REFRESH_INTERVAL_MS);
    });
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('TG-536 does not redirect after unmount during periodic final token read', async () => {
    jest.useFakeTimers();
    const getTokens = jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);
    jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue(null);
    const view = await render(<AppLayout />);
    await act(async () => {});
    let finish!: (value: null) => void;
    getTokens.mockResolvedValueOnce(validTokens).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      jest.advanceTimersByTime(SESSION_REFRESH_INTERVAL_MS);
    });
    await view.unmount();
    await act(async () => {
      finish(null);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to /login if getTokens rejects with an unhandled storage failure', async () => {
    jest.spyOn(tokenStorage, 'getTokens').mockRejectedValueOnce(new Error('Storage failure'));

    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });
});
