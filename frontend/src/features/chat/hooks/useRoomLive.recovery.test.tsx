import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makeMessage, makePage, makeRoom, PAU } from '../../../../__mocks__/chat';
import { mockUserProfile } from '../../../../__mocks__/profile';
import { AppError } from '../../../shared/errors';
import type { SocketStatus } from '../../../shared/realtime';
import { currentUserKeys } from '../../auth/hooks/useCurrentUser';
import { saveTokens } from '../../auth/tokenStorage';
import type { ChatListItem } from '../chatItems';
import { chatKeys } from './useChat';
import type { ChatSocketHandlers } from './useChatSocket';
import { useRoomLive } from './useRoomLive';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid-1') }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error' },
}));

// The live connection is a fake whose handlers the test calls as the server would, and whose
// `reconnect` is the same function on every render, so the test can tell it is passed on.
const mockSocket = {
  status: 'open' as SocketStatus,
  reconnect: jest.fn(),
  handlers: undefined as ChatSocketHandlers | undefined,
};
jest.mock('./useChatSocket', () => ({
  useChatSocket: (_eventId: string, handlers: ChatSocketHandlers) => {
    mockSocket.handlers = handlers;
    return {
      status: mockSocket.status,
      error: null,
      sendMessage: jest.fn(),
      reconnect: mockSocket.reconnect,
    };
  },
}));

const ROOM_PATH = `/api/events/${EVENT_ID}/chat/room`;
const MESSAGES_PATH = `/api/events/${EVENT_ID}/chat/messages`;

let client: QueryClient;
let calls: { method: string; url: URL }[];
let answers: Record<string, (url: URL) => Response | Promise<Response>>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountRoom() {
  const hook = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  await settle();
  return hook;
}

const messageIds = (items: ChatListItem[]) =>
  items.flatMap((item) => (item.kind === 'message' ? [item.message.id] : []));

const joinError = (code: string, status: number, retryable: boolean) =>
  new AppError({ kind: 'http', code, status, retryable });

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  client.setQueryData(currentUserKeys.me(), mockUserProfile);
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockSocket.status = 'open';
  mockSocket.reconnect.mockReset();
  mockSocket.handlers = undefined;
  calls = [];
  answers = {
    [`PUT ${ROOM_PATH}`]: () => jsonResponse(makeRoom()),
    [`GET ${MESSAGES_PATH}`]: () => jsonResponse(makePage([makeMessage(1, { author: PAU })])),
  };
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push({ method: request.method, url });
    const answer = answers[`${request.method} ${url.pathname}`];
    return answer ? answer(url) : problemResponse(404, 'NOT_FOUND');
  });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('useRoomLive: joining the live room fails (TG-469, US TG-64 criteri 15)', () => {
  it.each([
    ['RATE_LIMITED', 429, true],
    ['CHAT_ROOM_NOT_FOUND', 404, false],
    ['NOT_SUBSCRIBED', 403, false],
    ['PUBSUB_UNAVAILABLE', 503, true],
  ])('exposes a refused join (%s) as the error of the room', async (code, status, retryable) => {
    client.setQueryData(chatKeys.rooms, [makeRoom()]);
    const { result } = await mountRoom();

    await act(async () => mockSocket.handlers?.onError?.(joinError(code, status, retryable)));

    expect(result.current.error).toMatchObject({ code, retryable });
    expect(result.current.revoked).toBe(false);
    expect(client.getQueryState(chatKeys.rooms)?.isInvalidated).toBe(false);
  });

  it('reload forgets a refused join and asks for the room again', async () => {
    const { result } = await mountRoom();
    await act(async () =>
      mockSocket.handlers?.onError?.(joinError('PUBSUB_UNAVAILABLE', 503, true)),
    );
    expect(result.current.error?.code).toBe('PUBSUB_UNAVAILABLE');
    const puts = calls.filter((call) => call.method === 'PUT').length;

    await act(async () => {
      result.current.reload();
    });
    await settle();

    expect(result.current.error).toBeNull();
    expect(calls.filter((call) => call.method === 'PUT').length).toBe(puts + 1);
  });

  it('passes on the reconnect of the live connection', async () => {
    mockSocket.status = 'closed';
    const { result } = await mountRoom();

    await act(async () => {
      result.current.reconnect();
    });

    expect(mockSocket.reconnect).toHaveBeenCalledTimes(1);
  });
});

describe('useRoomLive: the history and its room (TG-469, US TG-64 criteri 14)', () => {
  it('does not ask for the history before the room is open', async () => {
    answers[`PUT ${ROOM_PATH}`] = () => new Promise<Response>(() => undefined);

    const { result } = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });
    await settle();

    expect(calls.filter((call) => call.method === 'GET')).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('keeps the history on screen when an older page fails', async () => {
    answers[`GET ${MESSAGES_PATH}`] = (url) =>
      url.searchParams.get('before') === 'c1'
        ? problemResponse(503, 'DATABASE_UNAVAILABLE')
        : jsonResponse(makePage([makeMessage(2, { author: PAU })], 'c1'));
    const { result } = await mountRoom();

    await act(async () => {
      result.current.loadOlder();
    });
    await settle();

    expect(result.current.error).toBeNull();
    expect(messageIds(result.current.items)).toEqual([makeMessage(2).id]);
  });
});

describe('useRoomLive: taken out of the room (TG-469, US TG-64 criteri 17)', () => {
  it('also invalidates the subscriptions, which list the rooms of the chat tab', async () => {
    client.setQueryData(chatKeys.subscriptions, []);
    await mountRoom();

    await act(async () => mockSocket.handlers?.onRevoked());

    expect(client.getQueryState(chatKeys.subscriptions)?.isInvalidated).toBe(true);
  });
});
