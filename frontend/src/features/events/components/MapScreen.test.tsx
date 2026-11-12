import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import MapScreen from '../../../app/(app)/map';

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

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

function mockEventsApi() {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = urlOf(input);
    if (pathname === '/api/events/active') return jsonResponse([meteorShowerEvent]);
    if (pathname === '/api/events/upcoming') return jsonResponse([launchEvent, lunarEvent]);
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

  it('puts on the map only the events that have a location', async () => {
    await renderScreen();

    const html = await waitForMapHtml((page) => page.includes(launchEvent.id));
    expect(html).not.toContain(lunarEvent.id);
    expect(html).not.toContain(meteorShowerEvent.id);
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
