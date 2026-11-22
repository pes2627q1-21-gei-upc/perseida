import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { launchEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { otherSpace, spotwiseLibrary, unvotedCafe } from '../../../../__mocks__/meetingPoints';
import i18n from '../../../shared/i18n';
import { saveTokens } from '../../auth/tokenStorage';
import { MeetingPointsScreen } from './MeetingPointsScreen';

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
}));

const permission = jest.mocked(Location.requestForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);
const currentPermission = jest.mocked(Location.getForegroundPermissionsAsync);

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Where the person is: synthetic coordinates in Barcelona. */
const DEVICE = { latitude: 41.4036, longitude: 2.1744 };
const points = [spotwiseLibrary, unvotedCafe, otherSpace];

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
// Each profile is a radio button or a tab (both say which one is on), as in ProfileSwitch.
const OPTION_ROLE = /^(radio|tab)$/;

let client: QueryClient;
let fetchSpy: jest.SpyInstance;
let meetingPoints: () => Response | Promise<Response>;

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}

/** The query strings of the requests for meeting points, in order. */
function pointRequests(): URLSearchParams[] {
  return fetchSpy.mock.calls
    .map(([input]) => urlOf(input as RequestInfo))
    .filter((url) => url.pathname === '/api/meeting-points')
    .map((url) => url.searchParams);
}

function grantAt(latitude: number, longitude: number) {
  permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  position.mockResolvedValue({
    coords: { latitude, longitude },
    timestamp: 0,
  } as Location.LocationObject);
}

/** Whether the option is announced as the chosen one, as a tab (selected) or a radio (checked). */
function isOn(element: { props: Record<string, unknown> }): boolean {
  const { props } = element;
  const state = (props.accessibilityState ?? {}) as { selected?: boolean; checked?: boolean };
  return (
    state.selected === true ||
    state.checked === true ||
    props['aria-selected'] === true ||
    props['aria-checked'] === true
  );
}

/**
 * The announce of AccessibilityInfo is already a jest.fn() of the setup: spyOn gives back that
 * same mock and restoreAllMocks does not empty its calls, so they are cleared here.
 */
function announceSpy() {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  announce.mockClear();
  return announce;
}

async function renderScreen(eventId = launchEvent.id) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <MeetingPointsScreen eventId={eventId} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  grantAt(DEVICE.latitude, DEVICE.longitude);
  meetingPoints = () => jsonResponse(points);
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = urlOf(input as RequestInfo);
    // The events of the map, where the title of the event is looked up.
    if (pathname === '/api/events/active') return jsonResponse([meteorShowerEvent]);
    if (pathname === '/api/events/upcoming') return jsonResponse([launchEvent]);
    if (pathname === '/api/meeting-points') return meetingPoints();
    throw new Error(`unexpected request to ${pathname}`);
  });
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('MeetingPointsScreen (TG-352)', () => {
  it('is headed by the title of the meeting points', async () => {
    await renderScreen();

    expect(await screen.findByRole('header', { name: t('meetingPoints.title') })).toBeTruthy();
  });

  it('names the event the places are recommended for (criterion 4)', async () => {
    await renderScreen();

    expect(await screen.findByText(launchEvent.title)).toBeTruthy();
  });

  it('asks for the location of the person once, when it opens (criterion 1)', async () => {
    await renderScreen();

    await screen.findByText(spotwiseLibrary.name);
    expect(permission).toHaveBeenCalledTimes(1);
    expect(position).toHaveBeenCalledTimes(1);
  });

  it('shows that it is locating, and asks the API nothing, while the position comes (criterion 1)', async () => {
    position.mockReturnValue(new Promise(() => undefined));
    await renderScreen();

    await waitFor(() => expect(permission).toHaveBeenCalledTimes(1));
    // The host view of the native spinner of ActivityIndicator.
    const spinners = screen.root!.queryAll(
      (node) => typeof node.type === 'string' && /ActivityIndicator/.test(node.type),
    );
    expect(spinners.length).toBeGreaterThan(0);
    const [spinner] = spinners;
    // The spinner says what it waits for to screen readers, with a real text.
    expect(typeof spinner.props.accessibilityLabel).toBe('string');
    expect(spinner.props.accessibilityLabel.length).toBeGreaterThan(0);
    expect(spinner.props.accessibilityLabel).not.toMatch(/^meetingPoints\./);
    expect(pointRequests()).toEqual([]);
    expect(screen.queryByLabelText(t('meetingPoints.list.label'))).toBeNull();
  });

  it('shows the watch party places around the person by default (criteria 1 and 4)', async () => {
    await renderScreen();

    expect(await screen.findByText(spotwiseLibrary.name)).toBeTruthy();
    expect(screen.getByText(unvotedCafe.name)).toBeTruthy();
    expect(screen.getByText(otherSpace.name)).toBeTruthy();
    expect(screen.getByLabelText(t('meetingPoints.list.label'))).toBeTruthy();
    const [search] = pointRequests();
    expect(search.get('profile')).toBe('watch_party');
    expect(Number(search.get('lat'))).toBe(DEVICE.latitude);
    expect(Number(search.get('lon'))).toBe(DEVICE.longitude);
  });

  it('offers the two profiles, with the watch party chosen (criterion 4)', async () => {
    await renderScreen();
    await screen.findByText(spotwiseLibrary.name);

    expect(screen.getByLabelText(t('meetingPoints.profile.label'))).toBeTruthy();
    const watchParty = screen.getByRole(OPTION_ROLE, {
      name: t('meetingPoints.profile.watch_party'),
    });
    const study = screen.getByRole(OPTION_ROLE, { name: t('meetingPoints.profile.study') });
    expect(isOn(watchParty)).toBe(true);
    expect(isOn(study)).toBe(false);
  });

  it('asks for the study places when the person picks the study profile (criterion 4)', async () => {
    await renderScreen();
    await screen.findByText(spotwiseLibrary.name);

    await fireEvent.press(
      screen.getByRole(OPTION_ROLE, { name: t('meetingPoints.profile.study') }),
    );

    await waitFor(() => expect(pointRequests()).toHaveLength(2));
    const second = pointRequests()[1];
    expect(second.get('profile')).toBe('study');
    expect(Number(second.get('lat'))).toBe(DEVICE.latitude);
    expect(Number(second.get('lon'))).toBe(DEVICE.longitude);
    expect(isOn(screen.getByRole(OPTION_ROLE, { name: t('meetingPoints.profile.study') }))).toBe(
      true,
    );
    // Changing the profile asks the API again, not the location.
    expect(permission).toHaveBeenCalledTimes(1);
  });

  it('shows the message of unavailability when Spotwise does not answer (criterion 5)', async () => {
    meetingPoints = () => problemResponse(503, 'MEETING_POINTS_UNAVAILABLE');
    await renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Ara no podem recomanar locals. Torna-ho a provar d'aquí a una estona.",
    );
    expect(screen.queryByText(spotwiseLibrary.name)).toBeNull();
  });

  it('asks the API again with the retry button of the list', async () => {
    let calls = 0;
    meetingPoints = () => {
      calls += 1;
      return calls === 1
        ? problemResponse(503, 'MEETING_POINTS_UNAVAILABLE')
        : jsonResponse(points);
    };
    await renderScreen();
    await screen.findByRole('alert');

    await fireEvent.press(screen.getByRole('button', { name: t('meetingPoints.retry') }));

    expect(await screen.findByText(spotwiseLibrary.name)).toBeTruthy();
    expect(pointRequests()).toHaveLength(2);
    // Retrying asks the API again, not the location.
    expect(permission).toHaveBeenCalledTimes(1);
  });

  describe('without the location of the person (criterion 1)', () => {
    it('says so and recommends nothing when the person denies the permission', async () => {
      permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
      await renderScreen();

      const message = t('meetingPoints.location.denied');
      expect(message).not.toBe('meetingPoints.location.denied');
      expect(await screen.findByText(message)).toBeTruthy();
      expect(position).not.toHaveBeenCalled();
      expect(pointRequests()).toEqual([]);
      expect(screen.queryByLabelText(t('meetingPoints.list.label'))).toBeNull();
      expect(screen.queryByText(spotwiseLibrary.name)).toBeNull();
    });

    it('says so and recommends nothing when the device cannot find the position', async () => {
      position.mockRejectedValue(new Error('Location services are disabled'));
      await renderScreen();

      const message = t('meetingPoints.location.unavailable');
      expect(message).not.toBe('meetingPoints.location.unavailable');
      // Not the same as a denied permission: here the person can turn the location on.
      expect(message).not.toBe(t('meetingPoints.location.denied'));
      expect(await screen.findByText(message)).toBeTruthy();
      expect(pointRequests()).toEqual([]);
      expect(screen.queryByLabelText(t('meetingPoints.list.label'))).toBeNull();
    });

    it.each([
      ['denied', 'meetingPoints.location.denied'],
      ['unavailable', 'meetingPoints.location.unavailable'],
    ] as const)('announces on iOS that the location is %s (WCAG 4.1.3)', async (status, key) => {
      // jest-expo runs as iOS, where a status is announced explicitly.
      if (status === 'denied') {
        permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
      } else {
        position.mockRejectedValue(new Error('Location services are disabled'));
      }
      const announce = announceSpy();
      await renderScreen();

      await screen.findByText(t(key));
      expect(announce).toHaveBeenCalledWith(t(key));
    });

    it('offers to try again when the device cannot find the position, and asks for it again', async () => {
      position.mockRejectedValueOnce(new Error('Location services are disabled'));
      await renderScreen();
      await screen.findByText(t('meetingPoints.location.unavailable'));
      const label = t('meetingPoints.location.retry');
      expect(label).not.toBe('meetingPoints.location.retry');

      await fireEvent.press(screen.getByRole('button', { name: label }));

      expect(await screen.findByText(spotwiseLibrary.name)).toBeTruthy();
      expect(position).toHaveBeenCalledTimes(2);
      expect(pointRequests()).toHaveLength(1);
    });

    it('offers no button to try again when the permission is denied: it is given in the settings', async () => {
      permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
      await renderScreen();
      await screen.findByText(t('meetingPoints.location.denied'));

      expect(screen.queryByRole('button', { name: t('meetingPoints.location.retry') })).toBeNull();
    });
  });

  describe('back to the app with the permission given in the settings (criterion 1)', () => {
    /** Listeners of AppState 'change', so a test can bring the app back to the foreground. */
    let appStateListeners: ((state: AppStateStatus) => void)[] = [];

    beforeEach(() => {
      appStateListeners = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
        if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
    });

    it('asks for the position again by itself and shows the places', async () => {
      permission.mockResolvedValueOnce({
        status: 'denied',
      } as Location.LocationPermissionResponse);
      await renderScreen();
      await screen.findByText(t('meetingPoints.location.denied'));
      expect(position).not.toHaveBeenCalled();
      expect(pointRequests()).toEqual([]);

      // The person gives the permission in the settings and comes back to the app.
      currentPermission.mockResolvedValue({
        status: 'granted',
      } as Location.LocationPermissionResponse);
      await act(async () => {
        for (const listener of appStateListeners) listener('active');
      });

      expect(await screen.findByText(spotwiseLibrary.name)).toBeTruthy();
      expect(permission).toHaveBeenCalledTimes(2);
      expect(position).toHaveBeenCalledTimes(1);
      const [search] = pointRequests();
      expect(Number(search.get('lat'))).toBe(DEVICE.latitude);
      expect(Number(search.get('lon'))).toBe(DEVICE.longitude);
    });
  });
});
