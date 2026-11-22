import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { otherOuting } from '../../../../__mocks__/outings';
import AppLayout from '../../../app/(app)/_layout';
import MapRoute from '../../../app/(app)/map';
import i18n from '../../../shared/i18n';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';

// Changed requirement of the person, trying the app on a phone (TG-352): the sheet of the map is
// a Modal, so it must not cover the screen it opens, and coming back it must be there again with
// the same event or outing. With the real router: only it moves the focus away from the map.

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

// Phone layout: the sheet is the Modal.
jest.mock('../../events/useIsWide', () => ({ useIsWide: () => false }));

// The native WebView does not run under Jest: a plain View keeps its props.
jest.mock('react-native-webview', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: (props: object) => createElement(View, props) };
});

// The testing library of expo-router mocks Reanimated with `react-native-reanimated/mock`, which
// lacks useReducedMotion (the sheet uses it): that mock is the one of the project here.
jest.mock('react-native-reanimated/mock', () =>
  jest.requireActual('../../../../__mocks__/react-native-reanimated'),
);

const MAP_LABEL = 'Mapa dels esdeveniments amb ubicació';

const stub = (name: string) =>
  function StubScreen() {
    return <Text>{name}</Text>;
  };

let client: QueryClient;

function urlOf(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue({
    accessToken: 'valid-acc',
    refreshToken: 'valid-ref',
  });
  jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue({
    access_token: 'new-acc',
    refresh_token: 'new-ref',
    token_type: 'bearer',
    expires_in: 900,
  });
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = urlOf(input as RequestInfo);
    if (pathname === '/api/events/active') return jsonResponse([meteorShowerEvent]);
    if (pathname === '/api/events/upcoming') return jsonResponse([launchEvent, lunarEvent]);
    if (pathname === '/api/outings') return jsonResponse([otherOuting]);
    throw new Error(`unexpected request to ${pathname}`);
  });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

async function renderMap() {
  await renderRouter(
    {
      '(app)/_layout': AppLayout,
      '(app)/index': stub('home-route'),
      '(app)/events': stub('events-route'),
      '(app)/chat': stub('chat-route'),
      '(app)/gamification': stub('gamification-route'),
      '(app)/profile': stub('profile-route'),
      '(app)/map': MapRoute,
      '(app)/apod': stub('apod-route'),
      '(app)/meeting-points/[eventId]': stub('meeting-points-route'),
      '(app)/outings/index': stub('outings-route'),
      '(app)/outings/new': stub('new-outing-route'),
      '(app)/outings/[id]/index': stub('outing-route'),
      '(app)/outings/[id]/edit': stub('edit-outing-route'),
      login: stub('login-route'),
    },
    { initialUrl: '/map', wrapper: Providers },
  );
}

/** Chooses a marker of the map, as its page does when it is tapped. */
async function select(id: string) {
  await waitFor(() => expect(screen.getByLabelText(MAP_LABEL).props.source.html).toContain(id));
  await act(() =>
    screen
      .getByLabelText(MAP_LABEL)
      .props.onMessage({ nativeEvent: { data: JSON.stringify({ select: id }) } }),
  );
}

describe('The sheet of the map over the screens it opens (TG-352)', () => {
  it.each([
    ['the outings of the event', 'events.sheet.outings', 'outings-route'],
    ['the meeting points', 'events.sheet.meetingPoints', 'meeting-points-route'],
  ])(
    'does not cover %s, and is there again with the same event coming back',
    async (_, key, route) => {
      await renderMap();
      await select(launchEvent.id);
      expect(screen.getByRole('header', { name: launchEvent.title })).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: i18n.t(key) }));
      expect(await screen.findByText(route)).toBeOnTheScreen();
      // A hidden Modal renders nothing, even out of the accessibility tree.
      expect(screen.queryByTestId('event-sheet', { includeHiddenElements: true })).toBeNull();

      await act(async () => {
        router.back();
      });

      expect(await screen.findByRole('header', { name: launchEvent.title })).toBeTruthy();
    },
  );

  it('does not cover the page of the outing, and is there again with it coming back', async () => {
    await renderMap();
    await select(otherOuting.id);
    expect(screen.getByRole('header', { name: otherOuting.title })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: i18n.t('events.outings.open') }));
    expect(await screen.findByText('outing-route')).toBeOnTheScreen();
    expect(screen.queryByTestId('event-sheet', { includeHiddenElements: true })).toBeNull();

    await act(async () => {
      router.back();
    });

    expect(await screen.findByRole('header', { name: otherOuting.title })).toBeTruthy();
  });
});
