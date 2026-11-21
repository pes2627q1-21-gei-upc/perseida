import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { AccessibilityInfo, AppState, type AppStateStatus, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent } from '../../../../__mocks__/events';
import EventsRoute from '../../../app/(app)/events';
import i18n from '../../../shared/i18n';
import { buildTheme, touch } from '../../../shared/theme';
import { formatEventWhen } from '../formatEvent';
import { EventsScreen } from './EventsScreen';

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
}));

// Each BlurView is a View with a test id, so the test can count them (RNTL 14 has no UNSAFE_*).
jest.mock('expo-blur', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BlurView: (props: object) => createElement(View, { ...props, testID: 'blur-view' }),
  };
});

const permission = jest.mocked(Location.requestForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);
const currentPermission = jest.mocked(Location.getForegroundPermissionsAsync);

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const BARCELONA = { latitude: 41.3874, longitude: 2.1686 };

// The texts of TG-51 are new keys: the tests read them in Catalan from the locales, and
// locales.test.ts makes sure the three languages have them.
const t = i18n.t.bind(i18n);
const CATEGORIES = () => t('events.search.categories');
const NEAR = () => t('events.search.near.label');

let client: QueryClient;
let fetchSpy: jest.SpyInstance;

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}

type Route = (url: URL) => Response | Promise<Response>;

/** Answers GET /api/events; by default with a launch (with a location) and the full moon. */
function mockSearchApi(route: Route = () => jsonResponse([launchEvent, lunarEvent])) {
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.pathname === '/api/events') return route(url);
    throw new Error(`unexpected request to ${url.pathname}`);
  });
}

/** Query of the last request to /api/events. */
function lastQuery(): URLSearchParams {
  const calls = fetchSpy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return urlOf(calls[calls.length - 1][0]).searchParams;
}

/** Today in UTC plus `days`, as YYYY-MM-DD. */
function utcDay(days = 0): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
    .toISOString()
    .slice(0, 10);
}

function grantLocation() {
  permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  position.mockResolvedValue({ coords: BARCELONA, timestamp: 0 } as Location.LocationObject);
}

async function renderScreen(Screen: () => React.JSX.Element = EventsScreen) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  mockSearchApi();
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('Events tab: filterable list of events (TG-51)', () => {
  it('is the screen of the Events tab, no longer a «coming soon» screen', async () => {
    await renderScreen(EventsRoute);

    expect(screen.getByLabelText(CATEGORIES())).toBeTruthy();
    expect(screen.queryByText('Pròximament')).toBeNull();
  });

  describe('list (criterion 6)', () => {
    it('lists the events with their title, translated category and dates in local time', async () => {
      await renderScreen();

      expect(await screen.findByText(launchEvent.title)).toBeTruthy();
      expect(screen.getByText(lunarEvent.title)).toBeTruthy();
      expect(screen.getByLabelText(/^Full Moon, Lluna, /)).toBeTruthy();
      expect(screen.getByLabelText(/, Llançament, /)).toBeTruthy();
      expect(screen.getByText(formatEventWhen(lunarEvent, 'ca'))).toBeTruthy();
      expect(screen.getByText(formatEventWhen(launchEvent, 'ca'))).toBeTruthy();
    });

    it('does nothing when a row is tapped: there is no event page yet', async () => {
      await renderScreen();
      await screen.findByText(lunarEvent.title);

      expect(screen.queryByRole('button', { name: /^Full Moon, / })).toBeNull();
    });

    it('asks by default for every category in the next 30 days, without location', async () => {
      await renderScreen();
      await screen.findByText(lunarEvent.title);

      const query = lastQuery();
      expect(query.get('from')).toBe(utcDay());
      expect(query.get('to')).toBe(utcDay(30));
      expect(query.has('category')).toBe(false);
      expect(query.has('lat')).toBe(false);
      expect(query.has('lon')).toBe(false);
      expect(query.has('radius_km')).toBe(false);
      expect(
        screen.getByRole('radio', { name: t('events.search.range.days30'), checked: true }),
      ).toBeTruthy();
      expect(screen.getByRole('switch', { name: NEAR() }).props.value).toBe(false);
    });

    it('shows no distance while «Near me» is off', async () => {
      await renderScreen();
      await screen.findByText(launchEvent.title);

      expect(screen.queryByText(t('events.search.distance', { distance: '7.391' }))).toBeNull();
    });

    it('opens the events map from its header', async () => {
      await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: t('events.search.openMap') }));

      expect(mockRouter.push).toHaveBeenCalledWith('/map');
    });
  });

  describe('category filter (criterion 6)', () => {
    it('offers one chip per category inside a named group, none chosen', async () => {
      await renderScreen();

      expect(screen.getByLabelText(CATEGORIES())).toBeTruthy();
      for (const name of ['Lluna', 'Sol', "Pluja d'estels", 'Llançament']) {
        expect(screen.getByRole('checkbox', { name, checked: false })).toBeTruthy();
      }
    });

    it('asks only for the chosen categories, and shows all of them again when none is left', async () => {
      // With categories the API answers only the full moon; without them, both events.
      mockSearchApi((url) =>
        jsonResponse(url.searchParams.has('category') ? [lunarEvent] : [launchEvent, lunarEvent]),
      );
      await renderScreen();
      await screen.findByText(launchEvent.title);

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Lluna' }));
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Sol' }));

      await waitFor(() => expect(lastQuery().getAll('category')).toEqual(['lunar', 'solar']));
      expect(screen.getByRole('checkbox', { name: 'Lluna', checked: true })).toBeTruthy();
      await waitFor(() => expect(screen.queryByText(launchEvent.title)).toBeNull());

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Lluna' }));
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Sol' }));

      // No category is the first query again: its fresh results come back from the cache.
      expect(await screen.findByText(launchEvent.title)).toBeTruthy();
      expect(screen.getByText(lunarEvent.title)).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: 'Lluna', checked: false })).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: 'Sol', checked: false })).toBeTruthy();
    });
  });

  describe('date filter (criterion 6)', () => {
    it('offers the ranges of 7, 30 and 90 days inside a named group', async () => {
      await renderScreen();

      expect(screen.getByLabelText(t('events.search.range.label'))).toBeTruthy();
      for (const key of ['days7', 'days30', 'days90']) {
        expect(screen.getByRole('radio', { name: t(`events.search.range.${key}`) })).toBeTruthy();
      }
    });

    it('asks for the next 7 days when that range is chosen', async () => {
      await renderScreen();
      await screen.findByText(lunarEvent.title);

      await fireEvent.press(screen.getByRole('radio', { name: t('events.search.range.days7') }));

      await waitFor(() => expect(lastQuery().get('to')).toBe(utcDay(7)));
      expect(lastQuery().get('from')).toBe(utcDay());
      expect(
        screen.getByRole('radio', { name: t('events.search.range.days7'), checked: true }),
      ).toBeTruthy();
    });
  });

  describe('«Near me» (criteria 6 and 7)', () => {
    it('asks for the permission only when it is turned on', async () => {
      grantLocation();
      await renderScreen();
      await screen.findByText(lunarEvent.title);
      expect(permission).not.toHaveBeenCalled();

      await fireEvent(screen.getByRole('switch', { name: NEAR() }), 'valueChange', true);

      await waitFor(() => expect(permission).toHaveBeenCalledTimes(1));
    });

    it('says it is locating while the position comes', async () => {
      permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
      position.mockReturnValue(new Promise(() => undefined));
      await renderScreen();

      await fireEvent(screen.getByRole('switch', { name: NEAR() }), 'valueChange', true);

      expect(await screen.findByText(t('events.search.near.locating'))).toBeTruthy();
    });

    it('asks with the position of the device and shows the distance of the events with a place', async () => {
      grantLocation();
      await renderScreen();
      await screen.findByText(lunarEvent.title);

      await fireEvent(screen.getByRole('switch', { name: NEAR() }), 'valueChange', true);

      await waitFor(() => expect(lastQuery().get('lat')).toBe('41.3874'));
      expect(lastQuery().get('lon')).toBe('2.1686');
      expect(lastQuery().has('radius_km')).toBe(false);
      // Barcelona - Cape Canaveral, about 7391 km (haversine).
      const distance = t('events.search.distance', { distance: '7.391' });
      expect(await screen.findByText(distance)).toBeTruthy();
      expect(screen.getAllByText(distance)).toHaveLength(1);
      expect(screen.getByRole('switch', { name: NEAR() }).props.value).toBe(true);
    });

    it('turns off with an explanation when the permission is denied, and the other filters keep working', async () => {
      permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
      await renderScreen();
      await screen.findByText(lunarEvent.title);

      await fireEvent(screen.getByRole('switch', { name: NEAR() }), 'valueChange', true);

      expect(await screen.findByText(t('events.search.near.denied'))).toBeTruthy();
      const near = screen.getByRole('switch', { name: NEAR() });
      expect(near).toBeDisabled();
      expect(near.props.value).toBe(false);
      expect(position).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Lluna' }));

      await waitFor(() => expect(lastQuery().getAll('category')).toEqual(['lunar']));
      expect(lastQuery().has('lat')).toBe(false);
      expect(lastQuery().has('lon')).toBe(false);
    });
  });

  describe('states (criterion 8)', () => {
    it('shows that the events are loading', async () => {
      jest.restoreAllMocks();
      mockSearchApi(() => new Promise<Response>(() => undefined));

      await renderScreen();

      expect(screen.getByLabelText('Carregant esdeveniments')).toBeTruthy();
    });

    it('says so when no event matches the filters', async () => {
      jest.restoreAllMocks();
      mockSearchApi(() => jsonResponse([]));

      await renderScreen();

      expect(await screen.findByText(t('events.search.empty'))).toBeTruthy();
    });

    it('shows an error with a retry button that asks again', async () => {
      jest.restoreAllMocks();
      let calls = 0;
      mockSearchApi(() => {
        calls += 1;
        // The hook retries a transient error once: both attempts fail.
        return calls <= 2 ? problemResponse(500, 'INTERNAL_ERROR') : jsonResponse([lunarEvent]);
      });
      await renderScreen();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Alguna cosa ha anat malament. Torna-ho a provar.',
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

      expect(await screen.findByText(lunarEvent.title)).toBeTruthy();
      expect(calls).toBe(3);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('accessibility (criterion 9)', () => {
    it('announces how many events the filters found', async () => {
      await renderScreen();

      const results = t('events.search.results', { count: 2 });
      expect(results).toContain('2');
      const announcement = await screen.findByText(results);
      expect(announcement).toHaveProp('accessibilityLiveRegion', 'polite');
      expect(announcement).toHaveProp('aria-live', 'polite');
    });

    it('announces the new count after filtering', async () => {
      await renderScreen();
      await screen.findByText(t('events.search.results', { count: 2 }));
      jest.restoreAllMocks();
      mockSearchApi(() => jsonResponse([lunarEvent]));

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Lluna' }));

      const results = t('events.search.results', { count: 1 });
      expect(results).not.toBe(t('events.search.results', { count: 2 }));
      expect(await screen.findByText(results)).toHaveProp('accessibilityLiveRegion', 'polite');
    });

    it('names the «Near me» switch', async () => {
      await renderScreen();

      expect(NEAR()).not.toBe('events.search.near.label');
      expect(screen.getByRole('switch', { name: NEAR() })).toBeTruthy();
    });

    it('gives the «Near me» switch a touch target of at least touch.min in both directions', async () => {
      await renderScreen();

      // The native iOS switch is 51×31 pt: the hitSlop has to make up the rest up to touch.min.
      const { hitSlop } = screen.getByRole('switch', { name: NEAR() }).props;
      expect(51 + (hitSlop?.left ?? 0) + (hitSlop?.right ?? 0)).toBeGreaterThanOrEqual(touch.min);
      expect(31 + (hitSlop?.top ?? 0) + (hitSlop?.bottom ?? 0)).toBeGreaterThanOrEqual(touch.min);
    });
  });
});

/** A response the test sends when it wants, to see the state in between. */
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function denyLocation() {
  permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
}

/** Permission granted, but the position cannot be read (location services off). */
function locationUnavailable() {
  permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  position.mockRejectedValue(new Error('Location services are disabled'));
}

async function turnNearOn() {
  await fireEvent(screen.getByRole('switch', { name: NEAR() }), 'valueChange', true);
}

const results = (count: number) => t('events.search.results', { count });

/** Whether the list (an element that holds the rows of the events) is announced as busy. */
function listIsBusy(): boolean {
  const holdsRows = (node: { props: Record<string, unknown> }) =>
    typeof node.props.accessibilityLabel === 'string' &&
    node.props.accessibilityLabel.startsWith(`${lunarEvent.title}, `);
  return (
    (screen.root?.queryAll(
      (node) =>
        (node.props.accessibilityState?.busy === true || node.props['aria-busy'] === true) &&
        node.queryAll(holdsRows).length > 0,
    ).length ?? 0) > 0
  );
}
const DISTANCE_TO_LAUNCH = () => t('events.search.distance', { distance: '7.391' });

describe('Events tab: review of TG-51', () => {
  describe('iOS announces the changes explicitly (accessibilitat.md, criterion 9)', () => {
    // jest-expo runs as iOS.
    it('announces the count of results, and the new one after filtering', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      mockSearchApi((url) =>
        jsonResponse(url.searchParams.has('category') ? [lunarEvent] : [launchEvent, lunarEvent]),
      );
      await renderScreen();

      await waitFor(() => expect(announce).toHaveBeenCalledWith(results(2)));
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Lluna' }));

      await waitFor(() => expect(announce).toHaveBeenCalledWith(results(1)));
    });

    it('announces that no event matches the filters', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      mockSearchApi(() => jsonResponse([]));

      await renderScreen();

      await waitFor(() => expect(announce).toHaveBeenCalledWith(t('events.search.empty')));
    });

    it('announces that it is locating', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
      position.mockReturnValue(new Promise(() => undefined));
      await renderScreen();

      await turnNearOn();

      await waitFor(() => expect(announce).toHaveBeenCalledWith(t('events.search.near.locating')));
    });

    it('announces that the permission is denied', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      denyLocation();
      await renderScreen();

      await turnNearOn();

      await waitFor(() => expect(announce).toHaveBeenCalledWith(t('events.search.near.denied')));
    });

    it('announces that the location is unavailable', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      locationUnavailable();
      await renderScreen();

      await turnNearOn();

      await waitFor(() =>
        expect(announce).toHaveBeenCalledWith(t('events.search.near.unavailable')),
      );
    });

    it.each(['android', 'web'] as const)(
      'does not announce explicitly on %s: the polite live region reads it',
      async (os) => {
        jest.replaceProperty(Platform, 'OS', os);
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
        await renderScreen();

        expect(await screen.findByText(results(2))).toHaveProp('accessibilityLiveRegion', 'polite');
        expect(announce).not.toHaveBeenCalledWith(results(2));
      },
    );
  });

  describe('contrast of the «Near me» switch (WCAG 1.4.11)', () => {
    it('draws the track of the switch when off with text.secondary of the theme', async () => {
      const { colors } = buildTheme('dia');

      await renderScreen();

      // On iOS (jest-expo) the native switch gets trackColor.false as tintColor.
      expect(screen.getByRole('switch', { name: NEAR() }).props.tintColor).toBe(
        colors.text.secondary,
      );
    });
  });

  describe('performance: no BlurView inside the rows', () => {
    it('mounts at most 3 BlurView with 10 events in the list', async () => {
      const many = Array.from({ length: 10 }, (_, index) => ({
        ...lunarEvent,
        id: `01a19288-a3f6-7576-a37b-8927650${String(index).padStart(5, '0')}`,
        title: `Event ${index + 1}`,
      }));
      mockSearchApi(() => jsonResponse(many));

      await renderScreen();

      await waitFor(() => expect(screen.getAllByLabelText(/^Event \d+, /)).toHaveLength(10));
      expect(
        screen.queryAllByTestId('blur-view', { includeHiddenElements: true }).length,
      ).toBeLessThanOrEqual(3);
    });
  });

  describe('results of the previous filters while the new ones come (placeholder data)', () => {
    it('marks the list busy and keeps the count until the new results arrive', async () => {
      const pending = deferred();
      mockSearchApi((url) =>
        url.searchParams.has('category')
          ? pending.promise
          : jsonResponse([launchEvent, lunarEvent]),
      );
      await renderScreen();
      await screen.findByText(results(2));
      expect(listIsBusy()).toBe(false);

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Lluna' }));

      await waitFor(() => expect(listIsBusy()).toBe(true));
      expect(screen.getByText(results(2))).toBeTruthy();

      await act(async () => pending.resolve(jsonResponse([lunarEvent])));

      expect(await screen.findByText(results(1))).toBeTruthy();
      expect(listIsBusy()).toBe(false);
    });

    it('shows no distance until the results near the device arrive', async () => {
      grantLocation();
      const pending = deferred();
      mockSearchApi((url) =>
        url.searchParams.has('lat') ? pending.promise : jsonResponse([launchEvent, lunarEvent]),
      );
      await renderScreen();
      await screen.findByText(launchEvent.title);

      await turnNearOn();

      await waitFor(() => expect(lastQuery().get('lat')).toBe('41.3874'));
      // The rows on screen are the results without location: no distance for them yet.
      expect(screen.queryByText(DISTANCE_TO_LAUNCH())).toBeNull();

      await act(async () => pending.resolve(jsonResponse([launchEvent, lunarEvent])));

      expect(await screen.findByText(DISTANCE_TO_LAUNCH())).toBeTruthy();
    });
  });

  describe('location unavailable or permission changed (criterion 7)', () => {
    it('turns off, but stays enabled, when the location is unavailable, and turning it on tries again', async () => {
      permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
      position
        .mockRejectedValueOnce(new Error('Location services are disabled'))
        .mockResolvedValueOnce({ coords: BARCELONA, timestamp: 0 } as Location.LocationObject);
      await renderScreen();
      await screen.findByText(lunarEvent.title);

      await turnNearOn();

      expect(await screen.findByText(t('events.search.near.unavailable'))).toBeTruthy();
      expect(screen.queryByText(t('events.search.near.denied'))).toBeNull();
      const near = screen.getByRole('switch', { name: NEAR() });
      expect(near.props.value).toBe(false);
      expect(near).not.toBeDisabled();

      await turnNearOn();

      await waitFor(() => expect(lastQuery().get('lat')).toBe('41.3874'));
      expect(position).toHaveBeenCalledTimes(2);
    });

    it('enables the switch again when the app comes back with the permission granted', async () => {
      const listeners: ((state: AppStateStatus) => void)[] = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
        if (type === 'change') listeners.push(listener as (state: AppStateStatus) => void);
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
      denyLocation();
      await renderScreen();
      await turnNearOn();
      expect(await screen.findByText(t('events.search.near.denied'))).toBeTruthy();
      expect(screen.getByRole('switch', { name: NEAR() })).toBeDisabled();
      currentPermission.mockResolvedValue({
        status: 'granted',
      } as Location.LocationPermissionResponse);

      await act(async () => {
        for (const listener of listeners) listener('active');
      });

      await waitFor(() => expect(screen.getByRole('switch', { name: NEAR() })).not.toBeDisabled());
      expect(screen.queryByText(t('events.search.near.denied'))).toBeNull();
    });
  });
});

describe('Events tab: thumb of the «Near me» switch (WCAG 1.4.11)', () => {
  const { colors } = buildTheme('dia');

  it('draws the thumb with surface.glassSolid when off, which reads on the track', async () => {
    await renderScreen();

    // On iOS (jest-expo) the native switch gets thumbColor as thumbTintColor.
    expect(screen.getByRole('switch', { name: NEAR() }).props.thumbTintColor).toBe(
      colors.surface.glassSolid,
    );
  });

  it('draws the thumb with gel.text when on', async () => {
    grantLocation();
    await renderScreen();
    await screen.findByText(lunarEvent.title);

    await fireEvent(screen.getByRole('switch', { name: NEAR() }), 'valueChange', true);

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: NEAR() }).props.value).toBe(true),
    );
    expect(screen.getByRole('switch', { name: NEAR() }).props.thumbTintColor).toBe(colors.gel.text);
  });
});
