import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import MapScreen from '../../../app/(app)/map';

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

// Phone layout unless a test asks for a wide screen.
let mockWide = false;
jest.mock('../useIsWide', () => ({ useIsWide: () => mockWide }));

// The native WebView does not run under Jest: a plain View keeps its props for the assertions.
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: View };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const MAP_LABEL = 'Mapa dels esdeveniments amb ubicació';

let client: QueryClient;

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
