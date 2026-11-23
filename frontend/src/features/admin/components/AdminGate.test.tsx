import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppError } from '../../../shared/errors';
import * as getCurrentUserModule from '../../auth/api/getCurrentUser';
import type { CurrentUser } from '../../auth/api/getCurrentUser';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';
import { AdminGate } from './AdminGate';

const NO_ACCESS_TITLE = 'Sense accés';
const PANEL = 'Contingut del panell';
const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1' };

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 1280, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function user(role: CurrentUser['role']): CurrentUser {
  return {
    id: '01a1bd9a-0000-7000-8000-0000000000aa',
    email: 'ana@example.com',
    display_name: 'Ana',
    avatar_url: null,
    preferred_language: 'ca',
    role,
    created_at: '2026-10-30T09:15:00Z',
  };
}

async function renderGate() {
  await act(async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SafeAreaProvider initialMetrics={SAFE_AREA}>
          <AdminGate>
            <Text>{PANEL}</Text>
          </AdminGate>
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(TOKENS);
  jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue(null);
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('AdminGate (TG-77 criteris 3 i 4)', () => {
  it.each(['admin', 'moderator'] as const)('lets the %s role into the panel', async (role) => {
    jest.spyOn(getCurrentUserModule, 'getCurrentUser').mockResolvedValue(user(role));

    await renderGate();

    expect(await screen.findByText(PANEL)).toBeOnTheScreen();
    expect(screen.queryByText(NO_ACCESS_TITLE)).not.toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows «sense accés» to a plain user and never the panel', async () => {
    jest.spyOn(getCurrentUserModule, 'getCurrentUser').mockResolvedValue(user('user'));

    await renderGate();

    expect(await screen.findByText(NO_ACCESS_TITLE)).toBeOnTheScreen();
    expect(screen.queryByText(PANEL)).not.toBeOnTheScreen();
  });

  it('shows nothing, neither the panel nor «sense accés», until the role is known', async () => {
    jest
      .spyOn(getCurrentUserModule, 'getCurrentUser')
      .mockImplementation(() => new Promise(() => {}));

    await renderGate();

    expect(screen.queryByText(PANEL)).not.toBeOnTheScreen();
    expect(screen.queryByText(NO_ACCESS_TITLE)).not.toBeOnTheScreen();
  });

  it('sends a person without a session to /login and does not ask for the profile', async () => {
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(null);
    const profile = jest.spyOn(getCurrentUserModule, 'getCurrentUser');

    await renderGate();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(profile).not.toHaveBeenCalled();
    expect(screen.queryByText(PANEL)).not.toBeOnTheScreen();
  });

  it('sends the person to /login when the session is rejected while reading the profile', async () => {
    jest
      .spyOn(getCurrentUserModule, 'getCurrentUser')
      .mockRejectedValue(
        new AppError({ kind: 'http', code: 'INVALID_SESSION', status: 401, retryable: false }),
      );

    await renderGate();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText(PANEL)).not.toBeOnTheScreen();
  });
});
