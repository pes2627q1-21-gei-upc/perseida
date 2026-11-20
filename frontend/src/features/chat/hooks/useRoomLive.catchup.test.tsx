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
import type { ChatSocketHandlers, SentChatMessage } from './useChatSocket';
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

// The live connection is a fake whose handlers the test calls as the server would; its status is
// what the test says it is on each render, and it keeps the join attempt of each render.
const mockSocket = {
  status: 'open' as SocketStatus,
  reconnect: jest.fn(),
  sendMessage: jest.fn<Promise<SentChatMessage>, [string, string?]>(),
  handlers: undefined as ChatSocketHandlers | undefined,
  joinAttempts: [] as (number | undefined)[],
};
jest.mock('./useChatSocket', () => ({
  useChatSocket: (_eventId: string, handlers: ChatSocketHandlers, joinAttempt?: number) => {
    mockSocket.handlers = handlers;
    mockSocket.joinAttempts.push(joinAttempt);
    return {
      status: mockSocket.status,
      error: null,
      sendMessage: mockSocket.sendMessage,
      reconnect: mockSocket.reconnect,
    };
  },
}));

/** The join attempts the room went through, without the repeats of every render. */
const attempts = () => [...new Set(mockSocket.joinAttempts.map((attempt) => attempt ?? 0))];

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

const historyCalls = () => calls.filter((call) => call.url.pathname === MESSAGES_PATH).length;

/** The connection goes to `status`; the room renders again, as it does when the socket says so. */
async function changeStatus(hook: Awaited<ReturnType<typeof mountRoom>>, status: SocketStatus) {
  mockSocket.status = status;
  await hook.rerender({});
  await settle();
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  client.setQueryData(currentUserKeys.me(), mockUserProfile);
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockSocket.status = 'open';
  mockSocket.reconnect.mockReset();
  mockSocket.sendMessage
    .mockReset()
    .mockResolvedValue({ id: 'm-1', sent_at: '2026-11-18T21:05:00Z' });
  mockSocket.handlers = undefined;
  mockSocket.joinAttempts = [];
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

describe('useRoomLive: what was said while out of the room (TG-469, re-review)', () => {
  const notSubscribed = () =>
    new AppError({ kind: 'http', code: 'NOT_SUBSCRIBED', status: 403, retryable: false });

  it('asks for the history again after joining again because of a NOT_SUBSCRIBED send', async () => {
    mockSocket.sendMessage.mockRejectedValue(notSubscribed());
    const { result } = await mountRoom();
    expect(historyCalls()).toBe(1);

    await act(async () => {
      await result.current.send('Hola');
    });
    await settle();

    expect(attempts()).toEqual([0, 1]);
    expect(historyCalls()).toBe(2);
  });

  it('asks for the history again when the connection comes back after a drop', async () => {
    const hook = await mountRoom();

    await changeStatus(hook, 'reconnecting');
    expect(historyCalls()).toBe(1);
    await changeStatus(hook, 'open');

    expect(historyCalls()).toBe(2);
  });

  it('also after the connection was closed and opened again', async () => {
    const hook = await mountRoom();

    await changeStatus(hook, 'closed');
    await changeStatus(hook, 'open');

    expect(historyCalls()).toBe(2);
  });

  it('does not ask again the first time the connection opens', async () => {
    mockSocket.status = 'connecting';
    const hook = await mountRoom();
    expect(historyCalls()).toBe(1);

    await changeStatus(hook, 'open');

    expect(historyCalls()).toBe(1);
  });

  it('does not ask again while the connection stays open, however often it renders', async () => {
    const hook = await mountRoom();

    await changeStatus(hook, 'open');
    await act(async () => mockSocket.handlers?.onMessage?.(makeMessage(9, { author: PAU })));
    await changeStatus(hook, 'open');

    expect(historyCalls()).toBe(1);
  });

  it('does not restart a request on its way when the connection flaps', async () => {
    const hook = await mountRoom();
    let release: () => void = () => undefined;
    answers[`GET ${MESSAGES_PATH}`] = () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(jsonResponse(makePage([makeMessage(1, { author: PAU })])));
      });

    await changeStatus(hook, 'reconnecting');
    await changeStatus(hook, 'open');
    await changeStatus(hook, 'reconnecting');
    await changeStatus(hook, 'open');
    await changeStatus(hook, 'reconnecting');
    await changeStatus(hook, 'open');
    expect(historyCalls()).toBe(2);

    await act(async () => release());
    await settle();
    expect(historyCalls()).toBe(2);
  });

  it('shows a message that arrived live and is also in the refetched page only once', async () => {
    const hook = await mountRoom();
    await act(async () => mockSocket.handlers?.onMessage?.(makeMessage(2, { author: PAU })));
    answers[`GET ${MESSAGES_PATH}`] = () =>
      jsonResponse(
        makePage([
          makeMessage(3, { author: PAU }),
          makeMessage(2, { author: PAU }),
          makeMessage(1, { author: PAU }),
        ]),
      );

    await changeStatus(hook, 'reconnecting');
    await changeStatus(hook, 'open');

    const ids = messageIds(hook.result.current.items);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain(makeMessage(3).id);
  });

  it('shows what was said while out of the room', async () => {
    const hook = await mountRoom();
    answers[`GET ${MESSAGES_PATH}`] = () =>
      jsonResponse(makePage([makeMessage(2, { author: PAU }), makeMessage(1, { author: PAU })]));

    await changeStatus(hook, 'reconnecting');
    await changeStatus(hook, 'open');

    expect(messageIds(hook.result.current.items)).toContain(makeMessage(2).id);
  });

  it('keeps the messages that were not sent while the history is asked for again', async () => {
    mockSocket.sendMessage.mockRejectedValue(
      new AppError({ kind: 'http', code: 'VALIDATION_ERROR', status: 422, retryable: false }),
    );
    const hook = await mountRoom();
    await act(async () => {
      await hook.result.current.send('Hola');
    });
    await settle();
    const pendingBefore = hook.result.current.items.filter((item) => item.kind === 'pending');
    expect(pendingBefore).toHaveLength(1);

    await changeStatus(hook, 'reconnecting');
    await changeStatus(hook, 'open');

    const pendingAfter = hook.result.current.items.filter((item) => item.kind === 'pending');
    expect(pendingAfter).toEqual(pendingBefore);
  });
});
