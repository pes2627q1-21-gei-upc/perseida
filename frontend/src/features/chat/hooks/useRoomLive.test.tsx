import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import {
  EVENT_ID,
  makeHistoryData,
  makeMessage,
  makePage,
  makeRoom,
  PAU,
} from '../../../../__mocks__/chat';
import { mockUserProfile } from '../../../../__mocks__/profile';
import { AppError } from '../../../shared/errors';
import type { SocketStatus } from '../../../shared/realtime';
import { currentUserKeys } from '../../auth/hooks/useCurrentUser';
import { saveTokens } from '../../auth/tokenStorage';
import type { ChatListItem, MessageItem } from '../chatItems';
import { chatKeys } from './useChat';
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

// The idempotency key of a message is made up on the client (TG-654).
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

// Haptics are native; on the web they may be missing or fail.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// The live connection has its own tests (useChatSocket.test.tsx): here it is a fake whose
// status the test sets and whose handlers the test calls as the server would.
const mockSocket = {
  status: 'open' as SocketStatus,
  sendMessage: jest.fn<Promise<SentChatMessage>, [string, string?]>(),
  eventIds: [] as string[],
  handlers: undefined as ChatSocketHandlers | undefined,
};
jest.mock('./useChatSocket', () => ({
  useChatSocket: (eventId: string, handlers: ChatSocketHandlers) => {
    mockSocket.eventIds.push(eventId);
    mockSocket.handlers = handlers;
    return {
      status: mockSocket.status,
      error: null,
      sendMessage: mockSocket.sendMessage,
      reconnect: jest.fn(),
    };
  },
}));

const ME = mockUserProfile;
/** The room the PUT opens: its id is the room of the messages I send. */
const OPENED_ROOM_ID = '01a1bd9a-0000-7000-8000-0000000000c9';
const ROOM_PATH = `/api/events/${EVENT_ID}/chat/room`;
const MESSAGES_PATH = `/api/events/${EVENT_ID}/chat/messages`;
const ACK: SentChatMessage = {
  id: '01a1bd9a-0000-7000-8000-0000000000f1',
  sent_at: '2026-11-18T21:05:00Z',
};

const fromPau = (n: number) => makeMessage(n, { author: PAU });
const mineOf = (n: number) => makeMessage(n, { author: { id: ME.id, name: ME.display_name } });

let client: QueryClient;
let calls: { method: string; url: URL }[];
let answers: Record<string, (url: URL) => Response | Promise<Response>>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Lets the answered requests and the state updates that follow them run. */
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

const messageItems = (items: ChatListItem[]) =>
  items.filter((item): item is MessageItem => item.kind === 'message');
const messageIds = (items: ChatListItem[]) => messageItems(items).map((item) => item.message.id);

/** A promise the test resolves or rejects when it wants: the server's ack on its way. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Calls `send(text)` inside act. The promise is wrapped in an object (an async function would
 * flatten it) and gets a no-op handler so a rejection is not reported as unhandled.
 */
async function startSending(send: (text: string) => Promise<unknown>, text: string) {
  let sending!: Promise<unknown>;
  await act(async () => {
    sending = send(text);
    sending.catch(() => undefined);
  });
  await settle();
  return { sending };
}

const rateLimited = () =>
  new AppError({ kind: 'http', code: 'RATE_LIMITED', status: 429, retryable: true });
const sendUncertain = () =>
  new AppError({ kind: 'network', code: 'SEND_UNCERTAIN', retryable: true });

beforeEach(async () => {
  // gcTime Infinity: a history left loading would otherwise keep a 5-minute timer and Jest alive.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  // Who is signed in, as useCurrentUser keeps it: read once per session.
  client.setQueryData(currentUserKeys.me(), ME);
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockSocket.status = 'open';
  mockSocket.eventIds = [];
  mockSocket.handlers = undefined;
  mockSocket.sendMessage.mockReset().mockResolvedValue(ACK);
  jest
    .mocked(Crypto.randomUUID)
    .mockReset()
    .mockReturnValueOnce('uuid-1')
    .mockReturnValue('uuid-2');
  jest.mocked(Haptics.impactAsync).mockReset().mockResolvedValue(undefined);
  jest.mocked(Haptics.notificationAsync).mockReset().mockResolvedValue(undefined);
  calls = [];
  answers = {
    [`PUT ${ROOM_PATH}`]: () => jsonResponse(makeRoom({ id: OPENED_ROOM_ID })),
    [`GET ${MESSAGES_PATH}`]: () => jsonResponse(makePage([fromPau(2), mineOf(1)])),
  };
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push({ method: request.method, url });
    const answer = answers[`${request.method} ${url.pathname}`];
    return answer ? answer(url) : problemResponse(404, 'NOT_FOUND');
  });
});

/**
 * An answer the test gives at its end. Every request runs under the timeout of shared/api (a
 * timer); one that is never answered keeps that timer alive after the test and Jest cannot exit.
 */
function answerLater() {
  let answer!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => (answer = resolve));
  return { response, answer };
}

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('useRoomLive: history and room (TG-469, US TG-64 criteris 14 i 15)', () => {
  it('is loading until the first page of the history arrives', async () => {
    const history = answerLater();
    answers[`GET ${MESSAGES_PATH}`] = () => history.response;

    const { result, unmount } = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);

    await unmount();
    history.answer(jsonResponse(makePage([])));
    await settle();
  });

  it('opens the room of the event (PUT) once when it mounts', async () => {
    await mountRoom();

    expect(calls.filter((call) => call.method === 'PUT').map((c) => c.url.pathname)).toEqual([
      ROOM_PATH,
    ]);
  });

  it('joins the live room of the same event', async () => {
    await mountRoom();

    expect(new Set(mockSocket.eventIds)).toEqual(new Set([EVENT_ID]));
  });

  it('shows the history newest first, telling my messages from the others', async () => {
    const { result } = await mountRoom();

    const items = messageItems(result.current.items);
    expect(items.map((item) => item.message.id)).toEqual([fromPau(2).id, mineOf(1).id]);
    expect(items.map((item) => item.mine)).toEqual([false, true]);
    expect(result.current.error).toBeNull();
  });

  it.each([
    [403, 'FORBIDDEN'],
    [404, 'EVENT_NOT_FOUND'],
  ])('exposes a %s from opening the room by its code (%s)', async (status, code) => {
    answers[`PUT ${ROOM_PATH}`] = () => problemResponse(status, code);

    const { result } = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.error?.code).toBe(code));
  });

  it('exposes a transient error of the history as retryable', async () => {
    answers[`GET ${MESSAGES_PATH}`] = () => problemResponse(503, 'DATABASE_UNAVAILABLE');

    const { result } = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.error?.code).toBe('DATABASE_UNAVAILABLE'));
    expect(result.current.error?.retryable).toBe(true);
  });

  it('reload asks for the room and the history again after an error', async () => {
    answers[`GET ${MESSAGES_PATH}`] = () => problemResponse(503, 'DATABASE_UNAVAILABLE');
    const { result } = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    answers[`GET ${MESSAGES_PATH}`] = () => jsonResponse(makePage([fromPau(3)]));

    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => expect(messageIds(result.current.items)).toEqual([fromPau(3).id]));
    expect(result.current.error).toBeNull();
    expect(calls.filter((call) => call.method === 'PUT').length).toBeGreaterThanOrEqual(2);
  });

  it('loadOlder asks for the previous page with the cursor and keeps each message once', async () => {
    answers[`GET ${MESSAGES_PATH}`] = (url) =>
      url.searchParams.get('before') === 'c1'
        ? jsonResponse(makePage([fromPau(2), fromPau(1)], null))
        : jsonResponse(makePage([fromPau(3), fromPau(2)], 'c1'));
    const { result } = await mountRoom();
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadOlder();
    });

    await waitFor(() =>
      expect(messageIds(result.current.items)).toEqual([
        fromPau(3).id,
        fromPau(2).id,
        fromPau(1).id,
      ]),
    );
    expect(result.current.hasMore).toBe(false);
    expect(calls.at(-1)?.url.searchParams.get('before')).toBe('c1');
  });

  it('passes on the status of the live connection', async () => {
    const hook = await mountRoom();
    expect(hook.result.current.status).toBe('open');

    mockSocket.status = 'reconnecting';
    await hook.rerender(undefined);

    expect(hook.result.current.status).toBe('reconnecting');
  });
});

describe('useRoomLive: messages that arrive (TG-469, US TG-64 criteri 15)', () => {
  it('adds a message of another person to the history, at the newest end', async () => {
    const { result } = await mountRoom();
    const arriving = fromPau(9);

    await act(async () => mockSocket.handlers?.onMessage(arriving));

    await waitFor(() => expect(messageIds(result.current.items)[0]).toBe(arriving.id));
    expect(
      client.getQueryData<ReturnType<typeof makeHistoryData>>(chatKeys.messages(EVENT_ID))?.pages[0]
        ?.messages[0],
    ).toEqual(arriving);
  });

  it('does not add twice a message that is already in the history', async () => {
    const { result } = await mountRoom();

    await act(async () => mockSocket.handlers?.onMessage(fromPau(2)));
    await settle();

    expect(messageIds(result.current.items)).toEqual([fromPau(2).id, mineOf(1).id]);
  });
});

describe('useRoomLive: sending (TG-469, US TG-64 criteris 14 i 16)', () => {
  it('shows the message as being sent, with a new client id, until the server confirms it', async () => {
    mockSocket.sendMessage.mockReturnValue(deferred<SentChatMessage>().promise);
    const { result } = await mountRoom();

    await startSending(result.current.send, 'Hola');

    expect(mockSocket.sendMessage).toHaveBeenCalledWith('Hola', 'uuid-1');
    expect(result.current.items[0]).toMatchObject({
      kind: 'pending',
      clientMessageId: 'uuid-1',
      text: 'Hola',
      status: 'sending',
    });
  });

  it('on the ack, replaces the pending message by mine as the server stored it', async () => {
    const { result } = await mountRoom();

    const { sending } = await startSending(result.current.send, 'Hola');

    await expect(sending).resolves.toBeUndefined();
    expect(result.current.items.some((item) => item.kind === 'pending')).toBe(false);
    const [newest] = messageItems(result.current.items);
    expect(newest?.mine).toBe(true);
    expect(newest?.message).toEqual({
      id: ACK.id,
      room_id: OPENED_ROOM_ID,
      author: { id: ME.id, name: ME.display_name },
      text: 'Hola',
      sent_at: ACK.sent_at,
    });
  });

  it('keeps the confirmed message in the history cache', async () => {
    const { result } = await mountRoom();

    await startSending(result.current.send, 'Hola');

    const history = client.getQueryData<ReturnType<typeof makeHistoryData>>(
      chatKeys.messages(EVENT_ID),
    );
    expect(history?.pages[0]?.messages[0]).toMatchObject({ id: ACK.id, text: 'Hola' });
  });

  it('marks the message as uncertain when the server did not answer (SEND_UNCERTAIN)', async () => {
    mockSocket.sendMessage.mockRejectedValue(sendUncertain());
    const { result } = await mountRoom();

    await startSending(result.current.send, 'Hola');

    expect(result.current.items[0]).toMatchObject({
      kind: 'pending',
      clientMessageId: 'uuid-1',
      status: 'uncertain',
    });
    expect(result.current.items[0]).not.toHaveProperty('error');
  });

  // Contract change (review of PR D): a refused send no longer rejects nor leaves a `sendError`
  // for the composer; the reason stays in the bubble, which is where the person retries it.
  it.each([
    ['RATE_LIMITED', 429, true],
    ['CHAT_MESSAGE_REJECTED', 422, false],
    ['CHAT_MESSAGE_TOO_LONG', 422, false],
    ['VALIDATION_ERROR', 422, false],
    ['CHAT_IDEMPOTENCY_CONFLICT', 409, false],
  ])(
    'a refused send (%s) leaves the message failed with its reason, and does not reject',
    async (code, status, retryable) => {
      mockSocket.sendMessage.mockRejectedValue(
        new AppError({ kind: 'http', code, status, retryable }),
      );
      const { result } = await mountRoom();

      const { sending } = await startSending(result.current.send, 'Hola');

      await expect(sending).resolves.toBeUndefined();
      expect(result.current.items[0]).toMatchObject({
        kind: 'pending',
        clientMessageId: 'uuid-1',
        status: 'failed',
        error: { code, retryable },
      });
      expect(result.current).not.toHaveProperty('sendError');
    },
  );

  it('a message that never left (NETWORK_ERROR) failed, and can be retried', async () => {
    mockSocket.sendMessage.mockRejectedValue(
      new AppError({ kind: 'network', code: 'NETWORK_ERROR', retryable: true }),
    );
    const { result } = await mountRoom();

    await startSending(result.current.send, 'Hola');

    expect(result.current.items[0]).toMatchObject({
      status: 'failed',
      error: { code: 'NETWORK_ERROR', retryable: true },
    });
  });

  it.each([
    ['PUBSUB_UNAVAILABLE', 503],
    ['DATABASE_UNAVAILABLE', 503],
    ['INTERNAL_ERROR', 500],
  ])(
    'a server error (%s) may come after the message was stored: it is uncertain, not failed',
    async (code, status) => {
      mockSocket.sendMessage.mockRejectedValue(
        new AppError({ kind: 'http', code, status, retryable: true }),
      );
      const { result } = await mountRoom();

      await startSending(result.current.send, 'Hola');

      expect(result.current.items[0]).toMatchObject({ kind: 'pending', status: 'uncertain' });
      expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    },
  );

  it('a FORBIDDEN send takes the person out of the room', async () => {
    client.setQueryData(chatKeys.rooms, [makeRoom()]);
    mockSocket.sendMessage.mockRejectedValue(
      new AppError({ kind: 'http', code: 'FORBIDDEN', status: 403, retryable: false }),
    );
    const { result } = await mountRoom();

    await startSending(result.current.send, 'Hola');

    expect(result.current.revoked).toBe(true);
    expect(client.getQueryState(chatKeys.rooms)?.isInvalidated).toBe(true);
  });

  it('send resolves as soon as the bubble takes the message, before the server answers', async () => {
    mockSocket.sendMessage.mockReturnValue(deferred<SentChatMessage>().promise);
    const { result } = await mountRoom();

    const { sending } = await startSending(result.current.send, 'Hola');

    await expect(sending).resolves.toBeUndefined();
    expect(result.current.items[0]).toMatchObject({ kind: 'pending', status: 'sending' });
  });

  it('discard drops a refused message from the room', async () => {
    mockSocket.sendMessage.mockRejectedValue(rateLimited());
    const { result } = await mountRoom();
    await startSending(result.current.send, 'Hola');

    await act(async () => {
      result.current.discard('uuid-1');
    });

    expect(result.current.items.some((item) => item.kind === 'pending')).toBe(false);
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('retry sends the same text again with the same client id, and the ack confirms it', async () => {
    mockSocket.sendMessage.mockRejectedValueOnce(sendUncertain()).mockResolvedValueOnce(ACK);
    const { result } = await mountRoom();
    await startSending(result.current.send, 'Hola');

    await act(async () => {
      void result.current.retry('uuid-1');
    });
    await settle();

    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(2, 'Hola', 'uuid-1');
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(result.current.items.some((item) => item.kind === 'pending')).toBe(false);
    expect(messageItems(result.current.items)[0]?.message).toMatchObject({
      id: ACK.id,
      text: 'Hola',
    });
  });

  // Contract change (review of PR D): the reason lives in the bubble, not in a `sendError`.
  it('a retry that goes through takes the failed bubble away, with its reason', async () => {
    mockSocket.sendMessage.mockRejectedValueOnce(rateLimited()).mockResolvedValueOnce(ACK);
    const { result } = await mountRoom();
    await startSending(result.current.send, 'Hola');
    expect(result.current.items[0]).toMatchObject({ error: { code: 'RATE_LIMITED' } });

    await act(async () => {
      void result.current.retry('uuid-1');
    });
    await settle();

    expect(result.current.items.some((item) => item.kind === 'pending')).toBe(false);
  });
});

describe('useRoomLive: taken out of the room (TG-469, US TG-64 criteri 17)', () => {
  function seedRooms() {
    client.setQueryData(chatKeys.rooms, [makeRoom()]);
  }

  it('when the server takes the person out, says so and invalidates the room list', async () => {
    seedRooms();
    const { result } = await mountRoom();
    expect(result.current.revoked).toBe(false);

    await act(async () => mockSocket.handlers?.onRevoked());

    expect(result.current.revoked).toBe(true);
    expect(client.getQueryState(chatKeys.rooms)?.isInvalidated).toBe(true);
  });

  it('a FORBIDDEN when joining the live room is the same as being taken out', async () => {
    seedRooms();
    const { result } = await mountRoom();

    await act(async () =>
      mockSocket.handlers?.onError?.(
        new AppError({ kind: 'http', code: 'FORBIDDEN', status: 403, retryable: false }),
      ),
    );

    expect(result.current.revoked).toBe(true);
    expect(client.getQueryState(chatKeys.rooms)?.isInvalidated).toBe(true);
  });
});

describe('useRoomLive: haptics (TG-469)', () => {
  it('gives a light tap when a message is sent', async () => {
    const { result } = await mountRoom();

    await startSending(result.current.send, 'Hola');

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('gives an error notification when a send is refused', async () => {
    mockSocket.sendMessage.mockRejectedValue(rateLimited());
    const { result } = await mountRoom();

    await startSending(result.current.send, 'Hola');

    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it.each([
    [
      'rejects',
      () => jest.mocked(Haptics.impactAsync).mockRejectedValue(new Error('No haptics here')),
    ],
    [
      'throws',
      () =>
        jest.mocked(Haptics.impactAsync).mockImplementation(() => {
          throw new Error('No haptics on the web');
        }),
    ],
  ])('sending still works when the haptics %s', async (_how, breakHaptics) => {
    breakHaptics();
    const { result } = await mountRoom();

    const { sending } = await startSending(result.current.send, 'Hola');

    await expect(sending).resolves.toBeUndefined();
    expect(messageItems(result.current.items)[0]?.message.id).toBe(ACK.id);
  });
});
