import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { makeMessage, makeRoom, makeSubscribedEvent } from '../../../../__mocks__/chat';
import { pendingResponses } from '../../../../__mocks__/pendingResponses';
import { colors, spacing } from '../../../shared/theme';
import { saveTokens } from '../../auth/tokenStorage';
import { rowSurface } from '../rowSurface';
import { ChatRoomsScreen } from './ChatRoomsScreen';

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

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const SUBSCRIPTIONS = '/api/me/subscriptions';
const ROOMS = '/api/chat/rooms';

const leonids = makeSubscribedEvent(1, { title: 'Leonids', starts_at: '2026-12-02T00:00:00Z' });
const geminids = makeSubscribedEvent(2, { title: 'Geminids', starts_at: '2026-12-14T00:00:00Z' });
const eclipse = makeSubscribedEvent(3, { title: 'Eclipsi', starts_at: '2026-12-20T00:00:00Z' });

let client: QueryClient;
let fetchSpy: jest.SpyInstance;
let answers: Record<string, () => Response>;

function requestsTo(path: string) {
  return fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => new URL(request.url).pathname === path);
}

function roomOf(event: { id: string }, text: string, sentAt: string, authorName = 'Laia') {
  return makeRoom({
    id: `room-${event.id}`,
    event_id: event.id,
    last_message: makeMessage(1, {
      text,
      sent_at: sentAt,
      author: { id: 'author-1', name: authorName },
    }),
  });
}

async function renderScreen(
  options: { tabBarHeight?: number; insets?: typeof SAFE_AREA.insets } = {},
) {
  await render(
    <SafeAreaProvider initialMetrics={{ ...SAFE_AREA, insets: options.insets ?? SAFE_AREA.insets }}>
      <QueryClientProvider client={client}>
        <BottomTabBarHeightContext.Provider value={options.tabBarHeight}>
          <ChatRoomsScreen />
        </BottomTabBarHeightContext.Provider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function roomIds() {
  return screen.getAllByTestId(/^chat-room-/).map((node) => node.props.testID as string);
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  answers = {
    [SUBSCRIPTIONS]: () => jsonResponse([leonids, geminids]),
    [ROOMS]: () => jsonResponse([]),
  };
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = new URL((input as Request).url);
    return (answers[pathname] ?? (() => problemResponse(404, 'NOT_FOUND')))();
  });
});

// Requests a test leaves on their way (to see the screen while it loads), answered once it is gone.
const pending = pendingResponses();

afterEach(async () => {
  await pending.release();
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('ChatRoomsScreen (TG-469)', () => {
  it('has the title of the screen as a header', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Xat' })).toBeOnTheScreen();
  });

  it('asks for the subscriptions and the rooms of the session, with its token', async () => {
    await renderScreen();

    await screen.findByText('Leonids');
    expect(requestsTo(SUBSCRIPTIONS)[0]?.headers.get('Authorization')).toBe('Bearer access-1');
    expect(requestsTo(ROOMS)[0]?.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('labels the spinner for screen readers while it is loading', async () => {
    fetchSpy.mockImplementation(() => pending.neverAnswered());

    await renderScreen();

    expect(screen.getByLabelText('Carregant sales de xat')).toBeOnTheScreen();
  });

  it('lists the subscribed events with their last message, newest message first', async () => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([leonids, geminids, eclipse]);
    answers[ROOMS] = () =>
      jsonResponse([
        roomOf(leonids, 'Vell', '2026-11-17T10:00:00Z', 'Marc'),
        roomOf(eclipse, 'Nou', '2026-11-19T10:00:00Z', 'Anna'),
      ]);

    await renderScreen();

    expect(await screen.findByText('Anna: Nou')).toBeOnTheScreen();
    expect(screen.getByText('Marc: Vell')).toBeOnTheScreen();
    expect(roomIds()).toEqual([
      `chat-room-${eclipse.id}`,
      `chat-room-${leonids.id}`,
      `chat-room-${geminids.id}`,
    ]);
  });

  it('lists an event without a room yet, saying there are no messages', async () => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([leonids]);

    await renderScreen();

    expect(await screen.findByText('Leonids')).toBeOnTheScreen();
    expect(screen.getByText('Encara no hi ha missatges')).toBeOnTheScreen();
  });

  it('does not list the rooms of events the person is not subscribed to', async () => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([leonids]);
    answers[ROOMS] = () =>
      jsonResponse([
        roomOf(leonids, 'Hola', '2026-11-17T10:00:00Z'),
        roomOf(eclipse, 'Intrús', '2026-11-18T10:00:00Z'),
      ]);

    await renderScreen();

    await screen.findByText('Leonids');
    expect(screen.queryByText('Eclipsi')).toBeNull();
    expect(roomIds()).toEqual([`chat-room-${leonids.id}`]);
  });

  it('names the list for screen readers', async () => {
    await renderScreen();

    await screen.findByText('Leonids');
    expect(screen.getByLabelText('Sales de xat')).toBeOnTheScreen();
  });

  it('opens the room of an event when its row is tapped (US TG-64 criteri 14)', async () => {
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: /^Leonids/ }));

    expect(mockRouter.push).toHaveBeenCalledWith(`/chat/${leonids.id}`);
  });
});

describe('ChatRoomsScreen without subscriptions', () => {
  beforeEach(() => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([]);
  });

  it('explains there is nothing to show and invites to explore the events', async () => {
    await renderScreen();

    expect(
      await screen.findByText(
        "Encara no t'has subscrit a cap esdeveniment. Subscriu-te'n a un per xerrar amb la comunitat.",
      ),
    ).toBeOnTheScreen();
  });

  it('opens the events tab from the button', async () => {
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: 'Explora els esdeveniments' }));

    expect(mockRouter.push).toHaveBeenCalledWith('/events');
  });

  it('shows no list', async () => {
    await renderScreen();

    await screen.findByRole('button', { name: 'Explora els esdeveniments' });
    expect(screen.queryByTestId('chat-rooms-list')).toBeNull();
  });
});

describe('ChatRoomsScreen errors', () => {
  it('shows the text of the error code and invites to try again when it is transient', async () => {
    answers[SUBSCRIPTIONS] = () => problemResponse(503, 'SESSION_UNAVAILABLE');

    await renderScreen();

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByText(
        "No podem comprovar la teva sessió ara mateix. Torna-ho a provar d'aquí a una estona.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Torna-ho a provar' })).toBeOnTheScreen();
  });

  it('shows the error too when only the rooms fail', async () => {
    answers[ROOMS] = () => problemResponse(503, 'DATABASE_UNAVAILABLE');

    await renderScreen();

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText('Leonids')).toBeNull();
  });

  it('asks again when the person tries again', async () => {
    answers[SUBSCRIPTIONS] = () => problemResponse(503, 'SESSION_UNAVAILABLE');
    await renderScreen();
    await screen.findByRole('alert');
    answers[SUBSCRIPTIONS] = () => jsonResponse([leonids]);

    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

    expect(await screen.findByText('Leonids')).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers no retry when the error is final', async () => {
    answers[SUBSCRIPTIONS] = () => problemResponse(401, 'INVALID_SESSION');
    answers['/api/auth/refresh'] = () => problemResponse(401, 'INVALID_SESSION');

    await renderScreen();

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByText('La teva sessió ha caducat. Torna a iniciar sessió.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
  });
});

describe('ChatRoomsScreen pull to refresh', () => {
  it('asks again for the subscriptions and the rooms, and shows the new data', async () => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([leonids]);
    await renderScreen();
    await screen.findByText('Leonids');
    answers[SUBSCRIPTIONS] = () => jsonResponse([leonids, geminids]);
    answers[ROOMS] = () => jsonResponse([roomOf(geminids, 'Nova', '2026-11-19T10:00:00Z')]);

    const list = screen.getByTestId('chat-rooms-list');
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });

    expect(await screen.findByText('Laia: Nova')).toBeOnTheScreen();
    expect(requestsTo(SUBSCRIPTIONS)).toHaveLength(2);
    expect(requestsTo(ROOMS)).toHaveLength(2);
  });
});

describe('ChatRoomsScreen above the floating tab bar', () => {
  const TAB_BAR = 80;

  it('leaves the height of the bar free under the list', async () => {
    await renderScreen({ tabBarHeight: TAB_BAR });

    await screen.findByText('Leonids');
    const content = StyleSheet.flatten(
      screen.getByTestId('chat-rooms-list').props.contentContainerStyle,
    );
    expect(content.paddingBottom).toBe(TAB_BAR + spacing.md);
  });

  it('leaves the height of the bar free under the empty state', async () => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([]);

    await renderScreen({ tabBarHeight: TAB_BAR });

    expect(await screen.findByTestId('chat-rooms-empty')).toHaveStyle({ paddingBottom: TAB_BAR });
  });

  it('leaves the height of the bar free under the error', async () => {
    answers[SUBSCRIPTIONS] = () => problemResponse(503, 'SESSION_UNAVAILABLE');

    await renderScreen({ tabBarHeight: TAB_BAR });

    expect(await screen.findByTestId('chat-rooms-status')).toHaveStyle({ paddingBottom: TAB_BAR });
  });

  it('leaves the height of the bar free under the spinner', async () => {
    fetchSpy.mockImplementation(() => pending.neverAnswered());

    await renderScreen({ tabBarHeight: TAB_BAR });

    expect(screen.getByTestId('chat-rooms-status')).toHaveStyle({ paddingBottom: TAB_BAR });
  });
});

describe('ChatRoomsScreen beside the notch', () => {
  // A phone in landscape: the cut-out takes room on the sides.
  const INSETS = { top: 0, left: 20, right: 24, bottom: 0 };

  it('keeps the empty state clear of the side insets, as the list is', async () => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([]);

    await renderScreen({ insets: INSETS });

    expect(await screen.findByTestId('chat-rooms-empty')).toHaveStyle({
      paddingLeft: INSETS.left + spacing.md,
      paddingRight: INSETS.right + spacing.md,
    });
  });

  it('keeps the error clear of the side insets (the panel adds its own margin)', async () => {
    answers[SUBSCRIPTIONS] = () => problemResponse(503, 'SESSION_UNAVAILABLE');

    await renderScreen({ insets: INSETS });

    expect(await screen.findByTestId('chat-rooms-status')).toHaveStyle({
      paddingLeft: INSETS.left,
      paddingRight: INSETS.right,
    });
  });
});

describe('ChatRoomsScreen reload without dragging (WCAG 2.5.1)', () => {
  it('has a button that asks again for the subscriptions and the rooms', async () => {
    await renderScreen();
    await screen.findByText('Leonids');
    answers[SUBSCRIPTIONS] = () => jsonResponse([leonids, geminids]);

    await fireEvent.press(screen.getByRole('button', { name: 'Actualitza' }));

    expect(await screen.findByText('Geminids')).toBeOnTheScreen();
    expect(requestsTo(SUBSCRIPTIONS)).toHaveLength(2);
    expect(requestsTo(ROOMS)).toHaveLength(2);
  });

  // The title sits on the scene and so does the button: over the pale lake and the moon glow a
  // quiet button with only a rim is not legible (WCAG 1.4.3). It sits on the glass of the rows,
  // measured at 4.5:1 over the whole scene in rowSurface.test.
  it('sits on the glass of the rows, never bare on the scene', async () => {
    await renderScreen();

    let node = (await screen.findByRole('button', { name: 'Actualitza' })).parent;
    let surface: unknown;
    while (node && surface === undefined) {
      surface = StyleSheet.flatten(node.props.style)?.backgroundColor;
      node = node.parent;
    }

    expect(surface).toBe(rowSurface(colors.dia.surface, false));
  });

  it('is also there when the list is empty, where there is nothing to drag', async () => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([]);

    await renderScreen();

    expect(await screen.findByRole('button', { name: 'Actualitza' })).toBeOnTheScreen();
  });

  it('is not there while loading', async () => {
    fetchSpy.mockImplementation(() => pending.neverAnswered());

    await renderScreen();

    expect(screen.queryByRole('button', { name: 'Actualitza' })).toBeNull();
  });

  it('is not there when the error already has its own retry', async () => {
    answers[SUBSCRIPTIONS] = () => problemResponse(503, 'SESSION_UNAVAILABLE');

    await renderScreen();

    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Actualitza' })).toBeNull();
  });
});

describe('ChatRoomsScreen when a reload fails with the list on screen', () => {
  const DATABASE_DOWN =
    "El servei no està disponible ara mateix. Torna-ho a provar d'aquí a una estona.";

  async function reloadThatFails(code = 'DATABASE_UNAVAILABLE', status = 503) {
    await renderScreen();
    await screen.findByText('Leonids');
    answers[ROOMS] = () => problemResponse(status, code);
    await fireEvent.press(screen.getByRole('button', { name: 'Actualitza' }));
  }

  it('says so in an alert and keeps the list the person already had', async () => {
    await reloadThatFails();

    expect(await screen.findByRole('alert')).toHaveTextContent(DATABASE_DOWN);
    expect(screen.getByText('Leonids')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Torna-ho a provar' })).toBeOnTheScreen();
  });

  it('retries from the alert and takes it away when the reload works', async () => {
    await reloadThatFails();
    await screen.findByRole('alert');
    answers[ROOMS] = () => jsonResponse([roomOf(leonids, 'Ja torna', '2026-11-19T10:00:00Z')]);

    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

    expect(await screen.findByText('Laia: Ja torna')).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers no retry when the error is final', async () => {
    await reloadThatFails('ACCOUNT_SUSPENDED', 403);

    expect(await screen.findByRole('alert')).toHaveTextContent('El teu compte està suspès.');
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
  });

  it('takes the alert away while the person tries again', async () => {
    await reloadThatFails();
    await screen.findByRole('alert');
    fetchSpy.mockImplementation(() => pending.neverAnswered());

    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Leonids')).toBeOnTheScreen();
  });

  it('is also shown over the empty state', async () => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([]);
    await renderScreen();
    await screen.findByRole('button', { name: 'Explora els esdeveniments' });
    answers[SUBSCRIPTIONS] = () => problemResponse(403, 'ACCOUNT_SUSPENDED');

    await fireEvent.press(screen.getByRole('button', { name: 'Actualitza' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El teu compte està suspès.');
    expect(screen.getByRole('button', { name: 'Explora els esdeveniments' })).toBeOnTheScreen();
  });

  it('is announced on iOS, where the live region is not enough', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await reloadThatFails();

    await screen.findByRole('alert');
    expect(announce).toHaveBeenCalledWith(DATABASE_DOWN);
  });

  it('is left to the live region on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await reloadThatFails();

    await screen.findByRole('alert');
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('ChatRoomsScreen empty state announcement', () => {
  const EMPTY =
    "Encara no t'has subscrit a cap esdeveniment. Subscriu-te'n a un per xerrar amb la comunitat.";

  beforeEach(() => {
    answers[SUBSCRIPTIONS] = () => jsonResponse([]);
  });

  it('is announced on iOS, as the loading errors are', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await renderScreen();

    await screen.findByText(EMPTY);
    expect(announce).toHaveBeenCalledWith(EMPTY);
  });

  it('is left to the live region on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await renderScreen();

    await screen.findByText(EMPTY);
    expect(announce).not.toHaveBeenCalled();
  });
});
