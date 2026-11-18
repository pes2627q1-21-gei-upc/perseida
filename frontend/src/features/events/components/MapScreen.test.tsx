import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { myOuting, otherOuting } from '../../../../__mocks__/outings';
import MapScreen from '../../../app/(app)/map';
import i18n from '../../../shared/i18n';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { describeOuting } from '../../outings/formatOuting';

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn(),
};

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

// Phone layout unless a test asks for a wide screen.
let mockWide = false;
jest.mock('../useIsWide', () => ({ useIsWide: () => mockWide }));

// The native WebView does not run under Jest: a plain View keeps its props for the assertions.
// It also counts its mounts: a new mount reloads the map page and loses the camera.
let mockWebViewMounts = 0;
jest.mock('react-native-webview', () => {
  const { createElement, useEffect } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  function WebView(props: object) {
    useEffect(() => {
      mockWebViewMounts += 1;
    }, []);
    return createElement(View, props);
  }
  return { WebView };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const MAP_LABEL = 'Mapa dels esdeveniments amb ubicació';

let client: QueryClient;

/** The host view that holds the top bar and the controls: the column of the screen. */
function columnOf(bar: ReturnType<typeof screen.getByTestId>) {
  let node = bar.parent;
  while (node && !(typeof node.type === 'string' && within(node).queryByTestId('map-controls'))) {
    node = node.parent;
  }
  return node!;
}

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}

type Route = () => Response | Promise<Response>;

/** By default: the Leonids are active, and a launch and the full moon are upcoming. */
function mockEventsApi(routes: { active?: Route; upcoming?: Route } = {}): jest.SpyInstance {
  const active = routes.active ?? (() => jsonResponse([meteorShowerEvent]));
  const upcoming = routes.upcoming ?? (() => jsonResponse([launchEvent, lunarEvent]));
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = urlOf(input);
    if (pathname === '/api/events/active') return active();
    if (pathname === '/api/events/upcoming') return upcoming();
    throw new Error(`unexpected request to ${pathname}`);
  });
}

async function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <MapScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** Waits until the page of the map satisfies `ready` and returns it. */
async function waitForMapHtml(ready: (html: string) => boolean): Promise<string> {
  let html = '';
  await waitFor(() => {
    html = screen.getByLabelText(MAP_LABEL).props.source.html;
    expect(ready(html)).toBe(true);
  });
  return html;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  mockRouter.canGoBack.mockReturnValue(true);
  mockWide = false;
  mockWebViewMounts = 0;
  mockEventsApi();
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('Events map screen', () => {
  it('has a screen title', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: "Mapa d'esdeveniments" })).toBeTruthy();
  });

  it('opens on the map view', async () => {
    await renderScreen();

    expect(screen.getByRole('tab', { name: 'Mapa', selected: true })).toBeTruthy();
    expect(screen.getByLabelText(MAP_LABEL)).toBeTruthy();
  });

  it('has the Map | List switch at the bottom, not over the map', async () => {
    await renderScreen();

    expect(within(screen.getByTestId('map-top-bar')).queryAllByRole('tab')).toEqual([]);
    expect(within(screen.getByTestId('map-controls')).getAllByRole('tab')).toHaveLength(2);
  });

  it('gives the whole view to the map', async () => {
    await renderScreen();

    expect(screen.getByTestId('map-area')).toHaveStyle({ flex: 1 });
  });

  it('puts on the map only the events that have a location', async () => {
    await renderScreen();

    const html = await waitForMapHtml((page) => page.includes(launchEvent.id));
    expect(html).not.toContain(lunarEvent.id);
    expect(html).not.toContain(meteorShowerEvent.id);
  });

  it('leaves the events without a location to the list view, not as markers (criterion 4)', async () => {
    await renderScreen();

    await waitForMapHtml((page) => page.includes(launchEvent.id));
    expect(screen.queryByText(meteorShowerEvent.title)).toBeNull();
    expect(screen.queryByText(lunarEvent.title)).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));

    expect(await screen.findByText(meteorShowerEvent.title)).toBeTruthy();
    expect(screen.getAllByText('Visible des de qualsevol lloc')).toHaveLength(2);
  });

  it('switches to the list, which shows every event', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));

    expect(screen.getByRole('tab', { name: 'Llista', selected: true })).toBeTruthy();
    expect(screen.queryByLabelText(MAP_LABEL)).toBeNull();
    for (const event of [launchEvent, meteorShowerEvent, lunarEvent]) {
      expect(await screen.findByText(event.title)).toBeTruthy();
    }
  });

  it('keeps the map where the user left it after a trip to the list', async () => {
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));
    const mounts = mockWebViewMounts;

    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));
    expect(await screen.findByText(meteorShowerEvent.title)).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Mapa' }));

    // The same map, never mounted again: its zoom and position stay as they were.
    expect(mockWebViewMounts).toBe(mounts);
    expect(screen.getByLabelText(MAP_LABEL)).toBeTruthy();
  });

  it('hides the map under the list from touch and screen readers', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));

    const area = screen.getByTestId('map-area', { includeHiddenElements: true });
    expect(area).toHaveProp('pointerEvents', 'none');
    expect(area).toHaveProp('accessibilityElementsHidden', true);
    expect(area).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(screen.queryByLabelText(MAP_LABEL)).toBeNull();
  });

  it('shows all the events by default (criterion 2)', async () => {
    await renderScreen();

    expect(screen.getByRole('radio', { name: 'Tots', checked: true })).toBeTruthy();
  });

  it('shows only the active events with the Active filter (criterion 2)', async () => {
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));

    await fireEvent.press(screen.getByRole('radio', { name: 'Actius' }));

    // The launch is upcoming: it leaves the map.
    await waitForMapHtml((page) => !page.includes(launchEvent.id));
    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));
    expect(await screen.findByText(meteorShowerEvent.title)).toBeTruthy();
    expect(screen.queryByText(launchEvent.title)).toBeNull();
    expect(screen.queryByText(lunarEvent.title)).toBeNull();
  });

  it('shows only the upcoming events with the Upcoming filter (criterion 2)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));
    await screen.findByText(meteorShowerEvent.title);

    await fireEvent.press(screen.getByRole('radio', { name: 'Futurs' }));

    expect(screen.queryByText(meteorShowerEvent.title)).toBeNull();
    expect(screen.getByText(launchEvent.title)).toBeTruthy();
    expect(screen.getByText(lunarEvent.title)).toBeTruthy();
  });

  it('opens the summary of the marker the user taps (criterion 3)', async () => {
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));

    await act(() =>
      screen
        .getByLabelText(MAP_LABEL)
        .props.onMessage({ nativeEvent: { data: JSON.stringify({ select: launchEvent.id }) } }),
    );

    expect(screen.getByRole('header', { name: launchEvent.title })).toBeTruthy();
    expect(screen.getByText('Inici')).toBeTruthy();
  });

  it('opens the outings of the event from its summary (TG-629)', async () => {
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));
    await act(() =>
      screen
        .getByLabelText(MAP_LABEL)
        .props.onMessage({ nativeEvent: { data: JSON.stringify({ select: launchEvent.id }) } }),
    );

    await fireEvent.press(screen.getByRole('button', { name: "Sortides d'aquest esdeveniment" }));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/outings',
      params: { eventId: launchEvent.id },
    });
  });

  it('opens the summary from the list too, and closes it', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));
    await screen.findByText(lunarEvent.title);

    await fireEvent.press(screen.getByRole('button', { name: /^Full Moon, Lluna, / }));
    expect(screen.getByRole('header', { name: lunarEvent.title })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Tanca la fitxa' }));
    expect(screen.queryByRole('header', { name: lunarEvent.title })).toBeNull();
  });

  it('shows that the events are loading (criterion 5)', async () => {
    jest.restoreAllMocks();
    mockEventsApi({ active: () => new Promise<Response>(() => undefined) });

    await renderScreen();

    expect(screen.getByLabelText('Carregant esdeveniments')).toBeTruthy();
    // The map is still there under the status.
    expect(screen.getByLabelText(MAP_LABEL)).toBeTruthy();
  });

  it('shows an error with a retry button that loads the events again (criterion 5)', async () => {
    jest.restoreAllMocks();
    let activeCalls = 0;
    mockEventsApi({
      active: () => {
        activeCalls += 1;
        // The hook retries a transient error once: both attempts fail.
        return activeCalls <= 2
          ? problemResponse(500, 'INTERNAL_ERROR')
          : jsonResponse([meteorShowerEvent]);
      },
    });
    await renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Alguna cosa ha anat malament. Torna-ho a provar.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

    await waitForMapHtml((page) => page.includes(launchEvent.id));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when there are no events at all (criterion 5)', async () => {
    jest.restoreAllMocks();
    mockEventsApi({ active: () => jsonResponse([]), upcoming: () => jsonResponse([]) });

    await renderScreen();

    expect(
      await screen.findByText('No hi ha esdeveniments actius ni en els pròxims 30 dies.'),
    ).toBeTruthy();
  });

  it('says so when the filter leaves no events (criterion 5)', async () => {
    jest.restoreAllMocks();
    mockEventsApi({ active: () => jsonResponse([]) });
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));

    await fireEvent.press(screen.getByRole('radio', { name: 'Actius' }));

    expect(screen.getByText('Ara mateix no hi ha cap esdeveniment actiu.')).toBeTruthy();
  });

  it('points to the list when none of the events has a place on the map', async () => {
    jest.restoreAllMocks();
    mockEventsApi({ upcoming: () => jsonResponse([lunarEvent]) });
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: 'Veure la llista' }));

    expect(screen.getByRole('tab', { name: 'Llista', selected: true })).toBeTruthy();
    expect(await screen.findByText(lunarEvent.title)).toBeTruthy();
  });

  it('on wide screens opens the summary beside the map (responsive)', async () => {
    mockWide = true;
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));

    await act(() =>
      screen
        .getByLabelText(MAP_LABEL)
        .props.onMessage({ nativeEvent: { data: JSON.stringify({ select: launchEvent.id }) } }),
    );

    expect(screen.getByTestId('event-sheet-side')).toBeTruthy();
    expect(screen.getByLabelText(MAP_LABEL)).toBeTruthy();
    expect(screen.getByRole('header', { name: launchEvent.title })).toBeTruthy();
  });

  it('on wide screens puts the summary in a row, beside the column of bar, map and controls (TG-647)', async () => {
    mockWide = true;
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));
    await act(() =>
      screen
        .getByLabelText(MAP_LABEL)
        .props.onMessage({ nativeEvent: { data: JSON.stringify({ select: launchEvent.id }) } }),
    );

    const side = screen.getByTestId('event-sheet-side');
    const row = side.parent!;
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
    const column = columnOf(screen.getByTestId('map-top-bar'));
    expect(StyleSheet.flatten(column.parent!.props.style).flexDirection).toBe('row');
    expect(within(column.parent!).getByTestId('event-sheet-side')).toBeTruthy();
    expect(column).not.toBe(side);
    expect(within(column).getByTestId('map-area')).toBeTruthy();
    expect(within(column).getByTestId('map-controls')).toBeTruthy();
    expect(within(column).queryByTestId('event-sheet-side')).toBeNull();
  });

  it('on wide screens the column takes the whole width while no event is selected (TG-647)', async () => {
    mockWide = true;
    await renderScreen();

    expect(screen.queryByTestId('event-sheet-side')).toBeNull();
    const column = columnOf(screen.getByTestId('map-top-bar'));
    expect(StyleSheet.flatten(column.props.style).flex).toBe(1);
    expect(StyleSheet.flatten(column.parent!.props.style).flexDirection).toBe('row');
    expect(within(column).getByTestId('map-controls')).toBeTruthy();
  });

  it('on narrow screens the summary is a bottom modal sheet, not a side panel (TG-647)', async () => {
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));
    await act(() =>
      screen
        .getByLabelText(MAP_LABEL)
        .props.onMessage({ nativeEvent: { data: JSON.stringify({ select: launchEvent.id }) } }),
    );

    expect(screen.queryByTestId('event-sheet-side')).toBeNull();
    const modal = screen.getByTestId('event-sheet');
    expect(modal.props.visible).toBe(true);
    expect(modal.props.transparent).toBe(true);
  });

  it('goes back to where the user came from', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));

    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('goes to the home screen when there is nowhere to go back to (a deep link)', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

// TG-646 (TG-52): the outings on the map, next to the events.
describe('Events map screen with outings (TG-646)', () => {
  /** Events as in the rest of the file, plus the outings route of the API. */
  function mockApi(outings: () => Response | Promise<Response> = () => jsonResponse([myOuting])) {
    jest.restoreAllMocks();
    const events = mockEventsApi();
    const base = events.getMockImplementation()!;
    events.mockImplementation(async (input, init) =>
      urlOf(input).pathname === '/api/outings' ? outings() : base(input, init),
    );
    return events;
  }

  function outingRequests(spy: jest.SpyInstance) {
    return spy.mock.calls
      .map(([input]) => urlOf(input as RequestInfo | URL))
      .filter((url) => url.pathname === '/api/outings');
  }

  async function tapMarker(id: string) {
    await act(() =>
      screen
        .getByLabelText(MAP_LABEL)
        .props.onMessage({ nativeEvent: { data: JSON.stringify({ select: id }) } }),
    );
  }

  beforeEach(async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  afterEach(async () => {
    await clearTokens();
  });

  it('asks for every future outing, not only the ones of the person or of an event (criterion 5)', async () => {
    const spy = mockApi();
    await renderScreen();
    await waitForMapHtml((page) => page.includes(myOuting.id));

    const [request, ...others] = outingRequests(spy);
    expect(others).toEqual([]);
    expect(request.searchParams.has('mine')).toBe(false);
    expect(request.searchParams.has('event_id')).toBe(false);
  });

  it('puts the outings on the map next to the events with the All filter (criterion 2)', async () => {
    mockApi();
    await renderScreen();

    const html = await waitForMapHtml((page) => page.includes(myOuting.id));
    expect(html).toContain(launchEvent.id);
    expect(html).toContain('"kind":"outing"');
  });

  it('names the marker of an outing with its title, "Sortida" and its date (criterion 4)', async () => {
    mockApi();
    await renderScreen();

    const html = await waitForMapHtml((page) => page.includes(myOuting.id));
    const OUTING_LABEL = describeOuting(myOuting, i18n.getFixedT('ca'), 'ca');
    expect(OUTING_LABEL).toContain(`${myOuting.title}, Sortida, `);
    expect(html).toContain(JSON.stringify(OUTING_LABEL).slice(1, -1));
  });

  it('shows only the outings with the Outings filter (criterion 2)', async () => {
    mockApi();
    await renderScreen();
    await waitForMapHtml((page) => page.includes(myOuting.id));

    await fireEvent.press(screen.getByRole('radio', { name: 'Sortides' }));

    const html = await waitForMapHtml((page) => !page.includes(launchEvent.id));
    expect(html).toContain(myOuting.id);
  });

  it('leaves the outings out with the Active and Upcoming filters (criterion 2)', async () => {
    mockApi();
    await renderScreen();
    await waitForMapHtml((page) => page.includes(myOuting.id));

    await fireEvent.press(screen.getByRole('radio', { name: 'Futurs' }));
    expect(await waitForMapHtml((page) => page.includes(launchEvent.id))).not.toContain(
      myOuting.id,
    );

    await fireEvent.press(screen.getByRole('radio', { name: 'Actius' }));
    expect(await waitForMapHtml((page) => !page.includes(launchEvent.id))).not.toContain(
      myOuting.id,
    );
  });

  it('keeps the list view with the events only (criterion 2)', async () => {
    mockApi();
    await renderScreen();
    await waitForMapHtml((page) => page.includes(myOuting.id));

    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));

    expect(await screen.findByText(lunarEvent.title)).toBeTruthy();
    expect(screen.queryByText(myOuting.title)).toBeNull();
  });

  it('says so when there are no outings with the Outings filter', async () => {
    mockApi(() => jsonResponse([]));
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));

    await fireEvent.press(screen.getByRole('radio', { name: 'Sortides' }));

    expect(await screen.findByText(i18n.t('events.empty.outings'))).toBeTruthy();
    expect(i18n.t('events.empty.outings')).not.toBe('events.empty.outings');
  });

  it('opens the summary of the outing the user taps, with the button to its page (criterion 3)', async () => {
    mockApi(() => jsonResponse([myOuting, otherOuting]));
    await renderScreen();
    await waitForMapHtml((page) => page.includes(myOuting.id));

    await tapMarker(myOuting.id);

    expect(screen.getByRole('header', { name: myOuting.title })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: i18n.t('events.outings.open') }));
    expect(mockRouter.push).toHaveBeenCalledWith(`/outings/${myOuting.id}`);
  });

  it('still opens the summary of an event when the user taps its marker', async () => {
    mockApi();
    await renderScreen();
    await waitForMapHtml((page) => page.includes(myOuting.id));

    await tapMarker(launchEvent.id);

    expect(screen.getByRole('header', { name: launchEvent.title })).toBeTruthy();
    expect(screen.queryByRole('button', { name: i18n.t('events.outings.open') })).toBeNull();
  });

  /** The warning of the controls, the only alert on the screen while the events are fine. */
  async function findWarning() {
    const warning = await within(screen.getByTestId('map-controls')).findByRole('alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    return warning;
  }

  it('keeps the events on the map and warns in the controls with the message of the error (criterion 5)', async () => {
    mockApi(() => problemResponse(500, 'INTERNAL_ERROR'));
    await renderScreen();

    const html = await waitForMapHtml((page) => page.includes(launchEvent.id));
    expect(html).not.toContain(myOuting.id);
    expect(await findWarning()).toHaveTextContent(i18n.t('errors.INTERNAL_ERROR'));
    expect(screen.queryByText(i18n.t('events.outings.unavailable'))).toBeNull();
  });

  it('warns with the message of the session when there is no session (INVALID_SESSION, criterion 5)', async () => {
    await clearTokens();
    mockApi();
    await renderScreen();

    await waitForMapHtml((page) => page.includes(launchEvent.id));
    const warning = await findWarning();
    expect(warning).toHaveTextContent(i18n.t('errors.INVALID_SESSION'));
    expect(i18n.t('errors.INVALID_SESSION')).not.toBe('errors.INVALID_SESSION');
  });

  it('warns with the message of whatever code the outings fail with', async () => {
    mockApi(() => problemResponse(404, 'NOT_FOUND'));
    await renderScreen();

    await waitForMapHtml((page) => page.includes(launchEvent.id));
    expect(await findWarning()).toHaveTextContent(i18n.t('errors.NOT_FOUND'));
  });

  it('shows the warning only with the Outings and All filters, not with Active nor Upcoming', async () => {
    mockApi(() => problemResponse(401, 'INVALID_SESSION'));
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));
    const text = i18n.t('errors.INVALID_SESSION');
    await findWarning();

    await fireEvent.press(screen.getByRole('radio', { name: 'Actius' }));
    expect(screen.queryByText(text)).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Futurs' }));
    expect(screen.queryByText(text)).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Tots' }));
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('gives no warning when the outings load', async () => {
    mockApi();
    await renderScreen();
    await waitForMapHtml((page) => page.includes(myOuting.id));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error status with the Outings filter when the outings fail (criterion 5)', async () => {
    mockApi(() => problemResponse(500, 'INTERNAL_ERROR'));
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));

    await fireEvent.press(screen.getByRole('radio', { name: 'Sortides' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Alguna cosa ha anat malament. Torna-ho a provar.',
    );
  });

  it('shows the message of the error code in the status of the Outings filter and in the warning (criterion 5)', async () => {
    await clearTokens();
    mockApi();
    await renderScreen();
    await waitForMapHtml((page) => page.includes(launchEvent.id));

    await fireEvent.press(screen.getByRole('radio', { name: 'Sortides' }));

    const text = i18n.t('errors.INVALID_SESSION');
    expect(await screen.findAllByText(text)).toHaveLength(2);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
});
