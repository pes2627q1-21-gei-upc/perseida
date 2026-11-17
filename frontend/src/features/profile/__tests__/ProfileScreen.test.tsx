import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, mockUserProfile, problemResponse } from '../../../../__mocks__/profile';
import { spacing } from '../../../shared/theme';
import * as tokenStorage from '../../auth/tokenStorage';
import { ProfileScreen } from '../components/ProfileScreen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

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
  mockReplace.mockClear();
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
    expect(screen.getByRole('header', { name: 'El teu perfil' })).toBeOnTheScreen();
    expect(screen.getByText('alex@example.com')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /tanca la sessió/i })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /torna-ho a provar/i })).not.toBeOnTheScreen();
  });

  it('renders the sign-up date in the active language (TG-385 criteri 3)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    // CLDR changed «de 2026» to «del 2026» in Catalan: accept both so the ICU of Node/Hermes does not matter.
    expect(await screen.findByText(/^Membre des de 30 d.octubre del? 2026$/)).toBeOnTheScreen();
  });

  it('signs out from the profile: closes the server session, wipes the tokens and goes to /login (TG-385 criteri 3)', async () => {
    const clearTokens = jest.spyOn(tokenStorage, 'clearTokens').mockResolvedValue();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input instanceof Request ? input.url : input).includes('/api/auth/logout')
          ? new Response(null, { status: 204 })
          : jsonResponse(mockUserProfile),
      );

    await renderProfile();
    await fireEvent.press(await screen.findByRole('button', { name: /tanca la sessió/i }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    const logoutCall = fetchSpy.mock.calls.find(([input]) =>
      String(input instanceof Request ? input.url : input).includes('/api/auth/logout'),
    );
    expect(logoutCall).toBeDefined();
    expect(clearTokens).toHaveBeenCalled();
  });

  it('hides the decorative avatar from screen readers: the name is read right after it (TG-385 #520)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    await screen.findByText('Àlex García');
    expect(screen.getByTestId('profile-avatar', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('profile-avatar')).not.toBeOnTheScreen();
  });

  it('shows the role and the preferred language of the user', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    expect(await screen.findByText('Observador')).toBeOnTheScreen();
    expect(screen.getByText('Català')).toBeOnTheScreen();
  });

  it.each([
    ['the initials of the name', { avatar_url: null }, 'ÀG'],
    [
      'the initials of a name with extra spaces',
      { avatar_url: null, display_name: '  àlex   garcía ' },
      'ÀG',
    ],
    ['a generic initial without name', { avatar_url: null, display_name: null }, 'U'],
  ])(
    'without a photo, the avatar shows %s (TG-385 criteri 3)',
    async (_case, overrides, initials) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => jsonResponse({ ...mockUserProfile, ...overrides }));

      await renderProfile();

      await screen.findByText('alex@example.com');
      expect(screen.getByText(initials, { includeHiddenElements: true })).toBeTruthy();
    },
  );

  it('shows the photo of the user when the avatar is a plain https URL', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    await screen.findByText('alex@example.com');
    const photo = screen.getByTestId('profile-avatar-image', { includeHiddenElements: true });
    expect(photo.props.source).toEqual({ uri: 'https://example.com/avatar.jpg' });
  });

  it.each([
    ['javascript:alert(1)'],
    ['http://example.com/avatar.jpg'],
    ['data:image/png;base64,AAAA'],
  ])(
    'never loads an unsafe avatar URL (%s): it shows the initials (ADR-0024)',
    async (avatarUrl) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () =>
          jsonResponse({ ...mockUserProfile, avatar_url: avatarUrl }),
        );

      await renderProfile();

      await screen.findByText('alex@example.com');
      expect(
        screen.queryByTestId('profile-avatar-image', { includeHiddenElements: true }),
      ).not.toBeOnTheScreen();
      expect(screen.getByText('ÀG', { includeHiddenElements: true })).toBeTruthy();
    },
  );

  it('falls back to the initials when the photo fails to load', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    await screen.findByText('alex@example.com');
    await fireEvent(
      screen.getByTestId('profile-avatar-image', { includeHiddenElements: true }),
      'error',
    );
    expect(await screen.findByText('ÀG', { includeHiddenElements: true })).toBeTruthy();
  });

  it('without a profile name, the heading is the email and the email is not repeated', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse({ ...mockUserProfile, display_name: null }));

    await renderProfile();

    expect(await screen.findByRole('header', { name: 'alex@example.com' })).toBeOnTheScreen();
    expect(screen.getAllByText('alex@example.com')).toHaveLength(1);
  });

  it('keeps the end of the profile clear of the floating tab bar (TG-385 criteri 5)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={queryClient}>
          <BottomTabBarHeightContext.Provider value={83}>
            <ProfileScreen />
          </BottomTabBarHeightContext.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    await screen.findByText('alex@example.com');
    expect(screen.getByTestId('profile-scroll').props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 83 + spacing.lg })]),
    );
  });

  it('hides a role or a language the app cannot translate yet instead of showing the raw value', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        jsonResponse({ ...mockUserProfile, role: 'astronomer', preferred_language: 'fr' }),
      );

    await renderProfile();

    await screen.findByText('alex@example.com');
    expect(screen.queryByText('astronomer')).not.toBeOnTheScreen();
    expect(screen.queryByText('fr')).not.toBeOnTheScreen();
  });

  it('renders gamification reserved slots (streak #57, achievements #59, followers #62)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    await waitFor(() => {
      expect(screen.getByText('Àlex García')).toBeOnTheScreen();
    });

    expect(screen.getByRole('header', { name: "Ratxa d'observació" })).toBeOnTheScreen();
    expect(screen.getByText(/fites i assoliments/i)).toBeOnTheScreen();
    expect(screen.getByText(/^Completa el qüestionari diari/)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Seguidors' })).toBeOnTheScreen();
    // Same «coming soon» badge as the tabs that are not built yet (comingSoon.badge).
    expect(screen.getAllByText('Pròximament')).toHaveLength(3);
  });

  it('shows error card with retry button when API fails', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => problemResponse(503, 'INTERNAL_ERROR'))
      .mockImplementationOnce(async () => problemResponse(503, 'INTERNAL_ERROR'))
      .mockImplementation(async () => jsonResponse(mockUserProfile));

    await renderProfile();

    const retryBtn = await screen.findByRole('button', { name: /torna-ho a provar/i });
    expect(retryBtn.props.accessibilityHint).toBe('Torna a carregar les dades del perfil');

    await fireEvent.press(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Àlex García')).toBeOnTheScreen();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
