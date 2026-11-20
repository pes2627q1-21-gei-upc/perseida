import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makeSubscribedEvent } from '../../../../__mocks__/chat';
import { saveTokens } from '../../auth/tokenStorage';
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

// The live room has its own tests: here it is a store the test sets, and the screen re-renders
// when it changes, as it would with the real hook.
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
const REVOKED_TEXT =
  "Ja no formes part d'aquest xat. Subscriu-te a l'esdeveniment per tornar-hi a escriure.";

let client: QueryClient;

function live(overrides: Partial<RoomLive> = {}): RoomLive {
  return {
    items: [],
    isLoading: false,
    error: null,
    revoked: false,
    status: 'open',
    reconnect: jest.fn(),
    send: jest.fn(async () => undefined),
    sendError: null,
    retry: jest.fn(async () => undefined),
    hasMore: false,
    isFetchingMore: false,
    loadOlder: jest.fn(),
    reload: jest.fn(),
    ...overrides,
  };
}

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

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockStore.listeners.clear();
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      jsonResponse([makeSubscribedEvent(1, { id: EVENT_ID, title: 'Leonids' })]),
    );
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('ChatRoomScreen: connection lost for good (TG-469, US TG-64 criteri 15)', () => {
  it('offers to reconnect when the connection is closed', async () => {
    const reconnect = jest.fn();
    await renderScreen({ status: 'closed', reconnect });

    await fireEvent.press(screen.getByRole('button', { name: 'Reconnecta' }));

    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it.each(['open', 'connecting', 'reconnecting'] as const)(
    'does not offer to reconnect while %s',
    async (status) => {
      await renderScreen({ status });

      expect(screen.queryByRole('button', { name: 'Reconnecta' })).toBeNull();
    },
  );

  it('keeps the reconnecting notice from screen readers: the composer already says it', async () => {
    await renderScreen({ status: 'reconnecting' });

    const notice = screen.getByText('Reconnectant…');
    expect(notice).toHaveProp('accessible', false);
    expect(notice).toHaveProp('importantForAccessibility', 'no');
    expect(screen.getByText("S'ha perdut la connexió. Podràs enviar quan es recuperi.")).toHaveProp(
      'accessibilityLiveRegion',
      'polite',
    );
  });

  it('shows no connection notice in a room the person was taken out of', async () => {
    await renderScreen({ status: 'closed', revoked: true });

    expect(screen.queryByRole('button', { name: 'Reconnecta' })).toBeNull();
    expect(screen.queryByText('Reconnectant…')).toBeNull();
  });
});

describe('ChatRoomScreen: while the history loads (TG-469)', () => {
  it('already shows the composer, which cannot send yet', async () => {
    await renderScreen({ isLoading: true });

    await fireEvent.changeText(screen.getByLabelText('Escriu un missatge'), 'Hola');

    expect(screen.getByRole('button', { name: 'Envia' })).toBeDisabled();
  });
});

describe('ChatRoomScreen: taken out, for screen readers (TG-469, WCAG 4.1.3)', () => {
  it('reads out the explanation when the person is taken out of an open room', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen();

    await setLive({ revoked: true });

    expect(screen.getByText(REVOKED_TEXT)).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(announce).toHaveBeenCalledWith(REVOKED_TEXT);
  });

  it('does not read out the invitation of an empty room', async () => {
    await renderScreen();

    expect(
      screen.getByText('Encara no hi ha missatges. Sigues la primera persona a escriure!'),
    ).toHaveProp('accessibilityLiveRegion', 'none');
  });
});
