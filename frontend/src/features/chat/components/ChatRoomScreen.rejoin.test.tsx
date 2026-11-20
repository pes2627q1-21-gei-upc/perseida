import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import {
  EVENT_ID,
  makeMessage,
  makePage,
  makeRoom,
  makeSubscribedEvent,
  PAU,
} from '../../../../__mocks__/chat';
import { mockUserProfile } from '../../../../__mocks__/profile';
import { AppError } from '../../../shared/errors';
import { currentUserKeys } from '../../auth/hooks/useCurrentUser';
import { saveTokens } from '../../auth/tokenStorage';
import type { ChatSocketHandlers } from '../hooks/useChatSocket';
import { ChatRoomScreen } from './ChatRoomScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    push: jest.fn(),
    replace: jest.fn(),
  }),
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

// The real live room (useRoomLive) over a fake connection that, like useChatSocket, joins
// `chat:event:<eventId>` when it mounts and leaves it when it unmounts. The test counts the joins.
const mockSocket = {
  joins: [] as string[],
  leaves: [] as string[],
  handlers: undefined as ChatSocketHandlers | undefined,
};
jest.mock('../hooks/useChatSocket', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useChatSocket: (eventId: string, handlers: ChatSocketHandlers) => {
      mockSocket.handlers = handlers;
      useEffect(() => {
        const room = `chat:event:${eventId}`;
        mockSocket.joins.push(room);
        return () => {
          mockSocket.leaves.push(room);
        };
      }, [eventId]);
      return { status: 'open', error: null, sendMessage: jest.fn(), reconnect: jest.fn() };
    },
  };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const ROOM = `chat:event:${EVENT_ID}`;

let client: QueryClient;

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  client.setQueryData(currentUserKeys.me(), mockUserProfile);
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockSocket.joins = [];
  mockSocket.leaves = [];
  mockSocket.handlers = undefined;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const key = `${request.method} ${new URL(request.url).pathname}`;
    if (key === 'GET /api/me/subscriptions') {
      return jsonResponse([makeSubscribedEvent(1, { id: EVENT_ID, title: 'Leonids' })]);
    }
    if (key === `PUT /api/events/${EVENT_ID}/chat/room`) return jsonResponse(makeRoom());
    if (key === `GET /api/events/${EVENT_ID}/chat/messages`) {
      return jsonResponse(makePage([makeMessage(1, { author: PAU, text: 'Bona nit' })]));
    }
    return problemResponse(404, 'NOT_FOUND');
  });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('ChatRoomScreen: joining the live room again (TG-469, US TG-64 criteri 15)', () => {
  it('retrying after a refused join joins the live room of the event again', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={client}>
          <ChatRoomScreen eventId={EVENT_ID} />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(await screen.findByText('Bona nit')).toBeOnTheScreen();
    expect(mockSocket.joins).toEqual([ROOM]);

    await act(async () =>
      mockSocket.handlers?.onError?.(
        new AppError({ kind: 'http', code: 'PUBSUB_UNAVAILABLE', status: 503, retryable: true }),
      ),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    await settle();

    expect(mockSocket.leaves).toEqual([ROOM]);
    expect(mockSocket.joins).toEqual([ROOM, ROOM]);
    expect(await screen.findByText('Bona nit')).toBeOnTheScreen();
  });
});
