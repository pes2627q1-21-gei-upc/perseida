import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, mockUserProfile, problemResponse } from '../../../../__mocks__/profile';
import * as tokenStorage from '../../auth/tokenStorage';
import { ProfileScreen } from './ProfileScreen';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const validTokens = {
  accessToken: 'valid-acc-123',
  refreshToken: 'valid-ref-123',
};

let queryClient: QueryClient;

async function renderProfile() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={queryClient}>
        <ProfileScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retryDelay: 0 },
    },
  });
  jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('ProfileScreen (TG-385 #517)', () => {
  it('shows loading indicator while fetching profile', async () => {
    let resolveFetch!: (res: Response) => void;
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    await renderProfile();

    expect(await screen.findByText('Carregant el perfil...')).toBeOnTheScreen();
    resolveFetch(jsonResponse(mockUserProfile));
  });

  it('renders user details when profile data is loaded successfully', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    await waitFor(() => {
      expect(screen.getByText('Àlex García')).toBeOnTheScreen();
    });
    expect(screen.getByText('alex@example.com')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /tanca la sessió/i })).toBeOnTheScreen();
  });

  it('renders gamification reserved slots (streak, achievements, activity)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    await waitFor(() => {
      expect(screen.getByText('Àlex García')).toBeOnTheScreen();
    });

    expect(screen.getByText(/ràtxa d'observació/i)).toBeOnTheScreen();
    expect(screen.getByText(/fites i assoliments/i)).toBeOnTheScreen();
    expect(screen.getByText(/activitat astronòmica/i)).toBeOnTheScreen();
  });

  it('shows error card with retry button when API fails', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => problemResponse(503, 'INTERNAL_ERROR'))
      .mockImplementationOnce(async () => problemResponse(503, 'INTERNAL_ERROR'))
      .mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    const retryBtn = await screen.findByRole('button', { name: /torna-ho a provar/i });
    expect(retryBtn).toBeOnTheScreen();

    await fireEvent.press(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Àlex García')).toBeOnTheScreen();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
