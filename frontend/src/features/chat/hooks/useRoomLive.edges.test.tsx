import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makeMessage, makePage, makeRoom, PAU } from '../../../../__mocks__/chat';
import { mockUserProfile } from '../../../../__mocks__/profile';
import { AppError } from '../../../shared/errors';
import { currentUserKeys } from '../../auth/hooks/useCurrentUser';
import { saveTokens } from '../../auth/tokenStorage';
import type { ChatListItem, MessageItem } from '../chatItems';
import type { SentChatMessage } from './useChatSocket';
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

const mockIds = { next: 0 };
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    mockIds.next += 1;
    return `uuid-${mockIds.next}`;
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error' },
}));

const mockSendMessage = jest.fn<Promise<SentChatMessage>, [string, string?]>();
jest.mock('./useChatSocket', () => ({
  useChatSocket: () => ({
    status: 'open',
    error: null,
    sendMessage: mockSendMessage,
    reconnect: jest.fn(),
  }),
}));

const ROOM_PATH = `/api/events/${EVENT_ID}/chat/room`;
const MESSAGES_PATH = `/api/events/${EVENT_ID}/chat/messages`;
const ACK: SentChatMessage = {
  id: '01a1bd9a-0000-7000-8000-0000000000f1',
  sent_at: '2026-11-18T21:05:00Z',
};

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

const messageItems = (items: ChatListItem[]) =>
  items.filter((item): item is MessageItem => item.kind === 'message');
const pendingOf = (items: ChatListItem[]) =>
  items.flatMap((item) => (item.kind === 'pending' ? [[item.clientMessageId, item.status]] : []));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  client.setQueryData(currentUserKeys.me(), mockUserProfile);
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockIds.next = 0;
  mockSendMessage.mockReset().mockResolvedValue(ACK);
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

describe('useRoomLive: several messages on their way (TG-469, US TG-64 criteri 16)', () => {
  it('a refused message leaves the others that are still on their way as they were', async () => {
    const first = deferred<SentChatMessage>();
    const refusal = new AppError({
      kind: 'http',
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
    });
    mockSendMessage.mockReturnValueOnce(first.promise).mockRejectedValueOnce(refusal);
    const { result } = await mountRoom();

    await act(async () => {
      void result.current.send('Primer');
      result.current.send('Segon').catch(() => undefined);
    });
    await settle();

    expect(pendingOf(result.current.items)).toEqual([
      ['uuid-2', 'failed'],
      ['uuid-1', 'sending'],
    ]);
  });

  it('retrying a message that is no longer pending sends nothing', async () => {
    const { result } = await mountRoom();

    await act(async () => {
      await result.current.retry('uuid-unknown');
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('useRoomLive: older pages (TG-469, US TG-64 criteri 14)', () => {
  const olderRequests = () => calls.filter((call) => call.url.searchParams.has('before')).length;

  it('asks for nothing older when the history has no more pages', async () => {
    const { result } = await mountRoom();
    expect(result.current.hasMore).toBe(false);

    await act(async () => {
      result.current.loadOlder();
    });
    await settle();

    expect(olderRequests()).toBe(0);
  });

  it('asks for an older page once while it is on its way', async () => {
    const older = deferred<Response>();
    answers[`GET ${MESSAGES_PATH}`] = (url) =>
      url.searchParams.get('before') === 'c1'
        ? older.promise
        : jsonResponse(makePage([makeMessage(2, { author: PAU })], 'c1'));
    const { result } = await mountRoom();

    await act(async () => {
      result.current.loadOlder();
    });
    await act(async () => {
      result.current.loadOlder();
    });

    // TanStack tells the hook on a timer of its own: wait for it, also on a busy machine.
    await waitFor(() => expect(result.current.isFetchingMore).toBe(true));
    expect(olderRequests()).toBe(1);
    older.resolve(jsonResponse(makePage([makeMessage(1, { author: PAU })])));
    await settle();
  });
});

describe('useRoomLive: two scroll ends in a row (TG-469)', () => {
  it('keeps the older page on its way instead of cancelling it and asking again', async () => {
    const older = deferred<Response>();
    answers[`GET ${MESSAGES_PATH}`] = (url) =>
      url.searchParams.get('before') === 'c1'
        ? older.promise
        : jsonResponse(makePage([makeMessage(2, { author: PAU })], 'c1'));
    const { result } = await mountRoom();

    // Both before the screen re-renders, as two quick onEndReached would.
    await act(async () => {
      result.current.loadOlder();
      result.current.loadOlder();
    });

    expect(calls.filter((call) => call.url.searchParams.has('before'))).toHaveLength(1);
    older.resolve(jsonResponse(makePage([makeMessage(1, { author: PAU })])));
    await settle();
  });
});

// Contract change (review of PR D): a message is never built without knowing who is signed in;
// the room waits for it (see useRoomLive.recovery.test.tsx), so the old test of a message sent
// with an unknown author is gone.
describe('useRoomLive: before the room is ready (TG-469)', () => {
  it('a message confirmed before the room opens arrives with the history, once', async () => {
    const room = deferred<Response>();
    answers[`PUT ${ROOM_PATH}`] = () => room.promise;
    const stored = makeMessage(7, { id: ACK.id, author: { id: mockUserProfile.id, name: 'Jo' } });
    answers[`GET ${MESSAGES_PATH}`] = () => jsonResponse(makePage([stored]));
    const { result } = await renderHook(() => useRoomLive(EVENT_ID), { wrapper });

    await act(async () => {
      await result.current.send('Hola');
    });
    room.resolve(jsonResponse(makeRoom()));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await settle();

    expect(messageItems(result.current.items).map((item) => item.message.id)).toEqual([ACK.id]);
    expect(pendingOf(result.current.items)).toEqual([]);
  });
});
