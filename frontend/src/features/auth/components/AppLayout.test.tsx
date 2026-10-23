import { act, render, waitFor } from '@testing-library/react-native';

import * as tokenStorage from '../tokenStorage';
import AppLayout from '../../../app/(app)/_layout';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  Stack: () => null,
}));

describe('AppLayout Route Guard (TG-43 #233)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redirects unauthenticated users to /login', async () => {
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(null);

    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('allows access and does not redirect when session tokens exist', async () => {
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue({
      accessToken: 'valid-acc',
      refreshToken: 'valid-ref',
    });

    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
