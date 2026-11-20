import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, DeviceEventEmitter, Platform, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makeMessage, makeSubscribedEvent, PAU } from '../../../../__mocks__/chat';
import { mockUserProfile } from '../../../../__mocks__/profile';
import { AppError } from '../../../shared/errors';
import { spacing } from '../../../shared/theme';
import { saveTokens } from '../../auth/tokenStorage';
import type { ChatMessage } from '../api/chat';
import { buildChatItems, type ChatListItem, type OutgoingMessage } from '../chatItems';
import { useRoomLive } from '../hooks/useRoomLive';
import { ChatRoomScreen } from './ChatRoomScreen';

type RoomLive = ReturnType<typeof useRoomLive>;

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

// The live room has its own tests (useRoomLive.test.tsx): here it is a store the test sets, and
// the screen re-renders when it changes, as it would with the real hook.
const mockStore = {
  live: undefined as unknown as RoomLive,
  listeners: new Set<() => void>(),
};
jest.mock('../hooks/useRoomLive', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  const subscribe = (listener: () => void) => {
    mockStore.listeners.add(listener);
    return () => mockStore.listeners.delete(listener);
  };
  return {
    useRoomLive: jest.fn(() => useSyncExternalStore(subscribe, () => mockStore.live)),
  };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const ME_ID = mockUserProfile.id;
const leonids = makeSubscribedEvent(1, { id: EVENT_ID, title: 'Leonids' });

let client: QueryClient;

function items(messages: unknown[], pending: OutgoingMessage[] = []): ChatListItem[] {
  return buildChatItems({ messages: messages as ChatMessage[], myUserId: ME_ID, pending });
}

function live(overrides: Partial<RoomLive> = {}): RoomLive {
  return {
    items: [],
    isLoading: false,
    error: null,
    revoked: false,
    status: 'open',
    send: jest.fn(async () => undefined),
    sendError: null,
    retry: jest.fn(),
    hasMore: false,
    isFetchingMore: false,
    loadOlder: jest.fn(),
    reload: jest.fn(),
    ...overrides,
  } as RoomLive;
}

/** What the live room says now: the screen re-renders with it. */
async function setLive(overrides: Partial<RoomLive>) {
  await act(async () => {
    mockStore.live = { ...mockStore.live, ...overrides };
    mockStore.listeners.forEach((listener) => listener());
  });
}

async function renderScreen(overrides: Partial<RoomLive> = {}) {
  mockStore.live = live(overrides);
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <ChatRoomScreen eventId={EVENT_ID} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

async function write(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Escriu un missatge'), text);
}

/** The keyboard as the OS reports it: both the «will» and the «did» events. */
async function keyboard(shown: boolean) {
  const [will, did] = shown
    ? ['keyboardWillShow', 'keyboardDidShow']
    : ['keyboardWillHide', 'keyboardDidHide'];
  const event = { endCoordinates: { height: shown ? 336 : 0, screenX: 0, screenY: 0, width: 390 } };
  await act(async () => {
    DeviceEventEmitter.emit(will, event);
    DeviceEventEmitter.emit(did, event);
  });
}

const error = (code: string, retryable: boolean, status = 400) =>
  new AppError({ kind: 'http', code, status, retryable });

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockStore.listeners.clear();
  mockRouter.canGoBack.mockReturnValue(true);
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = new URL((input as Request).url);
    return pathname === '/api/me/subscriptions'
      ? jsonResponse([leonids])
      : new Promise<Response>(() => undefined);
  });
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('ChatRoomScreen: bar (TG-469, US TG-64 criteri 14)', () => {
  it('opens the live room of its event', async () => {
    await renderScreen();

    expect(useRoomLive).toHaveBeenCalledWith(EVENT_ID);
  });

  it('has the title of the event as its header', async () => {
    await renderScreen();

    expect(await screen.findByRole('header', { name: 'Leonids' })).toBeOnTheScreen();
  });

  it('has a general title while the event is not known', async () => {
    jest.mocked(globalThis.fetch).mockImplementation(async () => jsonResponse([]));

    await renderScreen();

    expect(await screen.findByRole('header', { name: "Xat de l'esdeveniment" })).toBeOnTheScreen();
  });

  it('goes back to the room list with the back button', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('opens the room list when there is nothing to go back to (e.g. a link)', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));

    expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('ChatRoomScreen: states (TG-469, US TG-64 criteris 14 i 17)', () => {
  it('labels the spinner for screen readers while the history loads', async () => {
    await renderScreen({ isLoading: true });

    expect(screen.getByLabelText('Carregant missatges')).toBeOnTheScreen();
  });

  it('says there are no messages yet in an empty room', async () => {
    await renderScreen();

    expect(
      screen.getByText('Encara no hi ha missatges. Sigues la primera persona a escriure!'),
    ).toBeOnTheScreen();
  });

  it('lets the person write the first message of an empty room', async () => {
    const send = jest.fn(async () => undefined);
    await renderScreen({ send });

    await write('Hola!');
    await fireEvent.press(screen.getByRole('button', { name: 'Envia' }));

    expect(send).toHaveBeenCalledWith('Hola!');
  });

  it('shows the messages of the room and the limit of the composer', async () => {
    await renderScreen({ items: items([makeMessage(2, { author: PAU, text: 'Bona nit' })]) });

    expect(screen.getByLabelText('Missatges del xat')).toBeOnTheScreen();
    expect(screen.getByText('Bona nit')).toBeOnTheScreen();
    expect(screen.getByText('0/1000')).toBeOnTheScreen();
  });

  it('explains a transient error and retries it', async () => {
    const reload = jest.fn();
    await renderScreen({ error: error('NETWORK_ERROR', true), reload });

    expect(
      screen.getByText('No hi ha connexió. Comprova la xarxa i torna-ho a provar.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('explains a final error without offering a retry', async () => {
    await renderScreen({ error: error('EVENT_NOT_FOUND', false, 404) });

    expect(screen.getByText('Aquest esdeveniment ja no existeix.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
  });

  it.each([
    ['taken out of the room', { revoked: true }],
    ['refused (FORBIDDEN)', { error: error('FORBIDDEN', false, 403) }],
  ])(
    'when the person is %s, explains it, with no retry and no composer',
    async (_why, overrides) => {
      await renderScreen(overrides);

      expect(
        screen.getByText(
          "Ja no formes part d'aquest xat. Subscriu-te a l'esdeveniment per tornar-hi a escriure.",
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
      expect(screen.queryByLabelText('Escriu un missatge')).toBeNull();
    },
  );

  it('when the person is taken out, offers a way back to the room list', async () => {
    await renderScreen({ revoked: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Torna a les sales' }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('is taken out of a room that was open, without its messages', async () => {
    await renderScreen({ items: items([makeMessage(2, { author: PAU, text: 'Bona nit' })]) });

    await setLive({ revoked: true });

    expect(screen.getByRole('button', { name: 'Torna a les sales' })).toBeOnTheScreen();
    expect(screen.queryByText('Bona nit')).toBeNull();
  });
});

describe('ChatRoomScreen: connection (TG-469, US TG-64 criteri 15)', () => {
  it('shows a discreet notice while it reconnects', async () => {
    await renderScreen({ status: 'reconnecting' });

    expect(screen.getByText('Reconnectant…')).toBeOnTheScreen();
  });

  it('shows no connection notice while the connection works', async () => {
    await renderScreen({ status: 'open' });

    expect(screen.queryByText('Reconnectant…')).toBeNull();
  });

  it.each([
    ['connecting', 'Connectant amb el xat…'],
    ['reconnecting', "S'ha perdut la connexió. Podràs enviar quan es recuperi."],
    ['closed', 'No hi ha connexió amb el xat.'],
  ] as const)('does not let the person send while %s, and says why', async (status, reason) => {
    await renderScreen({ status });

    await write('Hola');

    expect(screen.getByText(reason)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Envia' })).toBeDisabled();
  });

  it('lets the person send once connected', async () => {
    await renderScreen({ status: 'open' });

    await write('Hola');

    expect(screen.getByRole('button', { name: 'Envia' })).toBeEnabled();
  });
});

describe('ChatRoomScreen: sending (TG-469, US TG-64 criteris 14 i 16)', () => {
  it('shows the message being sent, then the one the server confirmed', async () => {
    await renderScreen({
      items: items([], [{ clientMessageId: 'client-1', text: 'Hola', status: 'sending' }]),
    });
    expect(screen.getByText('Enviant')).toBeOnTheScreen();

    await setLive({
      items: items([makeMessage(5, { author: { id: ME_ID, name: 'Àlex García' }, text: 'Hola' })]),
    });

    expect(screen.queryByText('Enviant')).toBeNull();
    expect(screen.getByText('Hola')).toBeOnTheScreen();
  });

  it.each([
    ['RATE_LIMITED', 'Hi ha molta activitat ara mateix. Espera una mica i torna-ho a provar.'],
    [
      'CHAT_MESSAGE_REJECTED',
      'Aquest missatge no es pot publicar perquè no compleix les normes de la comunitat.',
    ],
    ['CHAT_MESSAGE_TOO_LONG', 'El missatge és massa llarg (màxim 1000 caràcters).'],
  ])(
    // Contract change (review of PR D): the field no longer keeps the text of a refused send and
    // the composer no longer shows its error; the bubble takes the text and says why.
    'a refused send (%s): the field clears and the bubble says why',
    async (code, message) => {
      const retryable = code === 'RATE_LIMITED';
      const send = jest.fn(async (text: string) => {
        mockStore.live = {
          ...mockStore.live,
          items: items(
            [],
            [{ clientMessageId: 'client-1', text, status: 'failed', error: { code, retryable } }],
          ),
        };
        mockStore.listeners.forEach((listener) => listener());
      });
      await renderScreen({ send });

      await write('Hola');
      await fireEvent.press(screen.getByRole('button', { name: 'Envia' }));

      expect(await screen.findByText(message)).toBeOnTheScreen();
      expect(screen.getAllByText(message)).toHaveLength(1);
      expect(screen.getByLabelText('Escriu un missatge')).toHaveDisplayValue('');
    },
  );

  it('discards a refused message from its bubble', async () => {
    const discard = jest.fn();
    await renderScreen({
      discard,
      items: items(
        [],
        [
          {
            clientMessageId: 'client-1',
            text: 'Hola',
            status: 'failed',
            error: { code: 'CHAT_MESSAGE_REJECTED', retryable: false },
          },
        ],
      ),
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Descarta' }));

    expect(discard).toHaveBeenCalledWith('client-1');
  });

  // «Descarta» takes the bubble away with it: the focus would fall to nowhere, so it goes to the
  // field where the person writes next (WCAG 2.4.3).
  it('after discarding a refused message the focus goes to the message field', async () => {
    const focus = jest
      .spyOn((TextInput as unknown as { prototype: { focus: () => void } }).prototype, 'focus')
      .mockImplementation(() => undefined);
    const discard = jest.fn();
    await renderScreen({
      discard,
      items: items(
        [],
        [
          {
            clientMessageId: 'client-1',
            text: 'Hola',
            status: 'failed',
            error: { code: 'CHAT_MESSAGE_REJECTED', retryable: false },
          },
        ],
      ),
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Descarta' }));

    expect(discard).toHaveBeenCalledWith('client-1');
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('retries a failed message from its bubble', async () => {
    const retry = jest.fn();
    await renderScreen({
      retry,
      items: items([], [{ clientMessageId: 'client-1', text: 'Hola', status: 'failed' }]),
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Reintenta' }));

    expect(retry).toHaveBeenCalledWith('client-1');
  });

  it('asks for older messages at the top of the list', async () => {
    const loadOlder = jest.fn();
    await renderScreen({
      hasMore: true,
      loadOlder,
      items: items([makeMessage(2, { author: PAU })]),
    });

    await fireEvent(screen.getByTestId('chat-messages-list'), 'endReached');

    expect(loadOlder).toHaveBeenCalledTimes(1);
  });
});

describe('ChatRoomScreen: messages that arrive, for screen readers (TG-469, WCAG 4.1.3)', () => {
  const history = () => items([makeMessage(1, { author: PAU, text: 'Hola a tothom' })]);
  const arriving = makeMessage(2, { author: PAU, text: 'Es veu Júpiter!' });

  it('announces on iOS a message of another person that arrives, with its author', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen({ items: history() });

    await setLive({
      items: items([arriving, makeMessage(1, { author: PAU, text: 'Hola a tothom' })]),
    });

    expect(announce).toHaveBeenCalledWith('Missatge nou de Pau: Es veu Júpiter!');
  });

  it('does not announce the history that is already there', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await renderScreen({ items: history() });

    expect(announce).not.toHaveBeenCalled();
  });

  it('does not announce my own message when the server confirms it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen({ items: history() });

    await setLive({
      items: items([
        makeMessage(3, { author: { id: ME_ID, name: 'Àlex García' }, text: 'Meu' }),
        makeMessage(1, { author: PAU, text: 'Hola a tothom' }),
      ]),
    });

    expect(announce).not.toHaveBeenCalled();
  });

  it('names a message without an author as from a user of Perseida', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen({ items: history() });

    await setLive({
      items: items([
        makeMessage(2, { author: { id: 'gone', name: null }, text: 'Bona nit' }),
        makeMessage(1, { author: PAU, text: 'Hola a tothom' }),
      ]),
    });

    expect(announce).toHaveBeenCalledWith('Missatge nou de Una usuària de Perseida: Bona nit');
  });

  it('on Android it reads the new message from a live region, not with an announcement', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen({ items: history() });

    await setLive({
      items: items([arriving, makeMessage(1, { author: PAU, text: 'Hola a tothom' })]),
    });

    expect(screen.getByText('Missatge nou de Pau: Es veu Júpiter!')).toHaveProp(
      'accessibilityLiveRegion',
      'polite',
    );
    expect(announce).not.toHaveBeenCalled();
  });

  it('on Android it reads again a message with the same text as the one before', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const said = 'Missatge nou de Pau: Es veu Júpiter!';
    await renderScreen({ items: history() });
    await setLive({
      items: items([arriving, makeMessage(1, { author: PAU, text: 'Hola a tothom' })]),
    });
    const first = screen.getByText(said);

    // Another message with the very same text: a live region only speaks when it changes, so it
    // has to be a new one.
    await setLive({
      items: items([
        makeMessage(3, { author: PAU, text: 'Es veu Júpiter!' }),
        arriving,
        makeMessage(1, { author: PAU, text: 'Hola a tothom' }),
      ]),
    });

    const second = screen.getByText(said);
    expect(second).not.toBe(first);
    expect(screen.getAllByText(said)).toHaveLength(1);
    expect(second).toHaveProp('accessibilityLiveRegion', 'polite');
    // Still never seen: one pixel, clipped.
    expect(StyleSheet.flatten(second.props.style)).toMatchObject({
      width: 1,
      height: 1,
      overflow: 'hidden',
    });
  });

  it('does not move the focus of the screen reader to the message that arrives', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    const event = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await renderScreen({ items: history() });

    await setLive({
      items: items([arriving, makeMessage(1, { author: PAU, text: 'Hola a tothom' })]),
    });

    expect(focus).not.toHaveBeenCalled();
    expect(event).not.toHaveBeenCalled();
  });
});

describe('ChatRoomScreen: keyboard (TG-469)', () => {
  // `chat-room-keyboard` is the KeyboardAvoidingView of the screen. Its host view does not keep
  // `behavior`, and Jest has no layout to measure: how far it moves is checked on a device.
  it('keeps the composer inside the view that avoids the keyboard', async () => {
    await renderScreen();

    const avoiding = screen.getByTestId('chat-room-keyboard');
    expect(within(avoiding).getByTestId('chat-composer')).toBeOnTheScreen();
  });

  it('leaves the bottom safe area under the composer while the keyboard is down', async () => {
    await renderScreen();

    expect(screen.getByTestId('chat-composer')).toHaveStyle({
      paddingBottom: spacing.sm + SAFE_AREA.insets.bottom,
    });
  });

  it('drops the bottom safe area while the keyboard is up, and gives it back when it goes', async () => {
    await renderScreen();

    await keyboard(true);
    expect(screen.getByTestId('chat-composer')).toHaveStyle({ paddingBottom: spacing.sm });

    await keyboard(false);
    expect(screen.getByTestId('chat-composer')).toHaveStyle({
      paddingBottom: spacing.sm + SAFE_AREA.insets.bottom,
    });
  });
});
