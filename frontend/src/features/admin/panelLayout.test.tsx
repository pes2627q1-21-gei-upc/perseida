import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PanelLayout from '../../app/(admin)/panel/_layout';
import * as getCurrentUserModule from '../auth/api/getCurrentUser';
import * as refreshTokenModule from '../auth/api/refreshToken';
import * as tokenStorage from '../auth/tokenStorage';

// The routes of the panel are what the layout's Slot draws: a stand-in shows when it does.
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  Slot: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>Ruta del panell</Text>;
  },
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 1280, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('panel layout (src/app/(admin)/panel)', () => {
  it('draws its routes only through the access gate', async () => {
    jest
      .spyOn(tokenStorage, 'getTokens')
      .mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue(null);
    jest.spyOn(getCurrentUserModule, 'getCurrentUser').mockResolvedValue({
      id: '01a1bd9a-0000-7000-8000-0000000000aa',
      email: 'ana@example.com',
      display_name: 'Ana',
      avatar_url: null,
      preferred_language: 'ca',
      role: 'user',
      created_at: '2026-10-30T09:15:00Z',
    });

    await act(async () => {
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <SafeAreaProvider initialMetrics={SAFE_AREA}>
            <PanelLayout />
          </SafeAreaProvider>
        </QueryClientProvider>,
      );
    });

    // A plain user gets «sense accés»: the route behind the gate is not drawn.
    expect(await screen.findByText('Sense accés')).toBeOnTheScreen();
    expect(screen.queryByText('Ruta del panell')).not.toBeOnTheScreen();
  });
});
