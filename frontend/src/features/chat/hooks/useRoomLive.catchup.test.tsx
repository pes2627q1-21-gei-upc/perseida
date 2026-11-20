import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makeMessage, makePage, makeRoom, PAU } from '../../../../__mocks__/chat';
import { deferredResponse } from '../../../../__mocks__/pendingResponses';
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

/**
 * The server acknowledges joining the live room: from now on whatever is published reaches this
 * client (ADR-0030: the ack comes once the subscription is active).
 */
async function joined() {
  await act(async () => mockSocket.handlers?.onJoined?.());
  await settle();
}

/** The connection drops and comes back, and the room is joined again. */
async function reconnects(hook: Awaited<ReturnType<typeof mountRoom>>) {
  await changeStatus(hook, 'reconnecting');
  await changeStatus(hook, 'open');
  await joined();
}

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
    // The new join is not active yet: what the history says now could miss a message.
    expect(historyCalls()).toBe(1);

    await joined();

    expect(historyCalls()).toBe(2);
  });

  it('asks for the history again once the room is joined after a reload of a refused join', async () => {
    const hook = await mountRoom();
    await act(async () =>
      mockSocket.handlers?.onError?.(
        new AppError({ kind: 'http', code: 'RATE_LIMITED', status: 429, retryable: true }),
      ),
    );
    await act(async () => hook.result.current.reload());
    await settle();
    const beforeJoining = historyCalls();

    await joined();

    expect(attempts()).toEqual([0, 1]);
    expect(historyCalls()).toBe(beforeJoining + 1);
  });

  it('asks for the history again when the connection comes back after a drop', async () => {
    const hook = await mountRoom();

    await changeStatus(hook, 'reconnecting');
    expect(historyCalls()).toBe(1);
    await changeStatus(hook, 'open');
    // Open, but the room is not joined again yet.
    expect(historyCalls()).toBe(1);

    await joined();

    expect(historyCalls()).toBe(2);
  });

  it('also after the connection was closed and opened again', async () => {
    const hook = await mountRoom();

    await changeStatus(hook, 'closed');
    await changeStatus(hook, 'open');
    await joined();

    expect(historyCalls()).toBe(2);
  });

  it('asks once more when the room is joined for the first time, if the history had already arrived', async () => {
    mockSocket.status = 'connecting';
    const hook = await mountRoom();
    expect(historyCalls()).toBe(1);

    await changeStatus(hook, 'open');
    // Open, but the room is not joined yet: the history is not asked for again.
    expect(historyCalls()).toBe(1);

    await joined();

    // Every join acknowledgement catches up, the first one included: a message published between
    // the answer of the history and the active subscription would be missed otherwise.
    expect(historyCalls()).toBe(2);
  });

  it('shows what was published between the history and the first join', async () => {
    const hook = await mountRoom();
    answers[`GET ${MESSAGES_PATH}`] = () =>
      jsonResponse(makePage([makeMessage(2, { author: PAU }), makeMessage(1, { author: PAU })]));

    await joined();

    expect(messageIds(hook.result.current.items)).toContain(makeMessage(2).id);
  });

  it('asks for nothing at the first join while the room is not open yet, and once it opens', async () => {
    const opening = deferredResponse();
    answers[`PUT ${ROOM_PATH}`] = () => opening.response;
    const hook = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });
    await settle();

    await joined();
    // There is no history to catch up on: its first page is asked for once the room opens, which
    // is after this join.
    expect(historyCalls()).toBe(0);

    opening.answer(jsonResponse(makeRoom()));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await settle();

    expect(historyCalls()).toBe(1);
  });

  it('asks again at the first join while the first request of the history is on its way, and keeps the answer of the new one', async () => {
    const requests = [deferredResponse(), deferredResponse()];
    answers[`GET ${MESSAGES_PATH}`] = () => (requests.shift() ?? deferredResponse()).response;
    const [abandoned, restarted] = [...requests];
    const hook = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });
    await waitFor(() => expect(historyCalls()).toBe(1));
    expect(hook.result.current.isLoading).toBe(true);

    await joined();

    // The first request may have read the history before the join: it is asked for again.
    expect(historyCalls()).toBe(2);
    restarted.answer(jsonResponse(makePage([makeMessage(2, { author: PAU })])));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    // The answer of the abandoned request, when it comes, does not take the new one's place.
    abandoned.answer(jsonResponse(makePage([makeMessage(1, { author: PAU })])));
    await settle();
    expect(messageIds(hook.result.current.items)).toEqual([makeMessage(2).id]);
    expect(historyCalls()).toBe(2);
  });

  it('leaves no request on its way when the room is left right after the first join', async () => {
    const onItsWay: ReturnType<typeof deferredResponse>[] = [];
    answers[`GET ${MESSAGES_PATH}`] = () => {
      const request = deferredResponse();
      onItsWay.push(request);
      return request.response;
    };
    const hook = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });
    await waitFor(() => expect(historyCalls()).toBe(1));
    await joined();
    expect(historyCalls()).toBe(2);

    await hook.unmount();
    onItsWay.forEach((request) => request.answer(jsonResponse(makePage([]))));
    await settle();

    // Nothing is asked for after leaving, and nothing is left fetching.
    expect(historyCalls()).toBe(2);
    expect(client.isFetching()).toBe(0);
  });

  it('does not ask again while the connection stays open, however often it renders', async () => {
    const hook = await mountRoom();

    await changeStatus(hook, 'open');
    await act(async () => mockSocket.handlers?.onMessage?.(makeMessage(9, { author: PAU })));
    await changeStatus(hook, 'open');

    expect(historyCalls()).toBe(1);
  });

  it('asks once per join, and a join while a request is on its way asks again', async () => {
    const hook = await mountRoom();
    const onItsWay: ReturnType<typeof deferredResponse>[] = [];
    answers[`GET ${MESSAGES_PATH}`] = () => {
      const request = deferredResponse();
      onItsWay.push(request);
      return request.response;
    };

    // The connection flaps without joining the room: nothing is asked for yet.
    await changeStatus(hook, 'reconnecting');
    await changeStatus(hook, 'open');
    await changeStatus(hook, 'reconnecting');
    await changeStatus(hook, 'open');
    expect(historyCalls()).toBe(1);

    await joined();
    expect(historyCalls()).toBe(2);

    // Joined again while that request is still on its way: it may have read the history before
    // this join, so it is asked for again, once.
    await reconnects(hook);
    expect(historyCalls()).toBe(3);

    await act(async () =>
      onItsWay.forEach((request) =>
        request.answer(jsonResponse(makePage([makeMessage(1, { author: PAU })]))),
      ),
    );
    await settle();
    expect(historyCalls()).toBe(3);
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

    await reconnects(hook);

    const ids = messageIds(hook.result.current.items);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain(makeMessage(3).id);
  });

  it('shows what was said while out of the room', async () => {
    const hook = await mountRoom();
    answers[`GET ${MESSAGES_PATH}`] = () =>
      jsonResponse(makePage([makeMessage(2, { author: PAU }), makeMessage(1, { author: PAU })]));

    await reconnects(hook);

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

    await reconnects(hook);

    const pendingAfter = hook.result.current.items.filter((item) => item.kind === 'pending');
    expect(pendingAfter).toEqual(pendingBefore);
  });
});
