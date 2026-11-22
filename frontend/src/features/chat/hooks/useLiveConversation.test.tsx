import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import type { ReactNode } from 'react';

import { makeMessage, makePage, makeRoom, PAU } from '../../../../__mocks__/chat';
import { mockUserProfile } from '../../../../__mocks__/profile';
import type { AppError } from '../../../shared/errors';
import { currentUserKeys } from '../../auth/hooks/useCurrentUser';
import type { ChatHistory, ChatRoom } from '../api/chat';
import type { ChatHistoryData } from '../chatCache';
import type { ChatListItem } from '../chatItems';
import type { ChatSocketHandlers, SentChatMessage } from './useChatSocket';
import { type LiveConversationSource, useLiveConversation } from './useLiveConversation';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error' },
}));

const mockSocket = {
  rooms: [] as string[],
  handlers: undefined as ChatSocketHandlers | undefined,
  sendMessage: jest.fn<Promise<SentChatMessage>, [string, string?, Record<string, unknown>?]>(),
};
jest.mock('./useChatSocket', () => ({
  useChatSocket: (room: string, handlers: ChatSocketHandlers) => {
    mockSocket.rooms.push(room);
    mockSocket.handlers = handlers;
    return {
      status: 'open',
      error: null,
      sendMessage: mockSocket.sendMessage,
      reconnect: jest.fn(),
    };
  },
}));

const ME = mockUserProfile;
const SOCKET_ROOM = 'dm:user:u-1';
const HISTORY_KEY = ['dm', 'messages', 'c-1'] as const;
const ACK: SentChatMessage = { id: 'ack-1', sent_at: '2026-11-18T21:05:00Z' };

let client: QueryClient;
let fetchHistory: jest.Mock<Promise<ChatHistory>, []>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A consumer of the core as the direct chat will be: its own queries, room and filters. */
function useConsumer(extra: Partial<LiveConversationSource> = {}) {
  const room = useQuery<ChatRoom, AppError>({
    queryKey: ['dm', 'conversation', 'c-1'],
    queryFn: async () => makeRoom({ id: 'conv-1' }) as ChatRoom,
  });
  const history = useInfiniteQuery<
    ChatHistory,
    AppError,
    ChatHistoryData,
    typeof HISTORY_KEY,
    string | undefined
  >({
    queryKey: HISTORY_KEY,
    queryFn: () => fetchHistory(),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: room.isSuccess,
  });
  return useLiveConversation({
    room,
    history,
    historyKey: HISTORY_KEY,
    socketRoom: SOCKET_ROOM,
    ...extra,
  });
}

async function mount(extra: Partial<LiveConversationSource> = {}) {
  const hook = await renderHook(() => useConsumer(extra), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

const ids = (items: ChatListItem[]) =>
  items.flatMap((item) => (item.kind === 'message' ? [item.message.id] : []));

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(currentUserKeys.me(), ME);
  mockSocket.rooms = [];
  mockSocket.handlers = undefined;
  mockSocket.sendMessage.mockReset().mockResolvedValue(ACK);
  jest.mocked(Crypto.randomUUID).mockReset().mockReturnValue('uuid-1');
  fetchHistory = jest.fn(async () => makePage([makeMessage(2, { author: PAU })]) as ChatHistory);
});

afterEach(() => client.clear());

describe('useLiveConversation (TG-65): nucli genèric', () => {
  it('uneix a la sala del socket que li donen i mostra l’històric injectat', async () => {
    const { result } = await mount();

    expect(new Set(mockSocket.rooms)).toEqual(new Set([SOCKET_ROOM]));
    expect(ids(result.current.items)).toEqual([makeMessage(2).id]);
  });

  it('afegeix els missatges en directe a l’històric injectat', async () => {
    const { result } = await mount();

    await act(async () => mockSocket.handlers?.onMessage(makeMessage(3, { author: PAU })));

    expect(ids(result.current.items)).toEqual([makeMessage(3).id, makeMessage(2).id]);
    expect(client.getQueryData<ChatHistoryData>(HISTORY_KEY)?.pages[0]?.messages).toHaveLength(2);
  });

  it('descarta els missatges que `accepts` rebutja i deixa passar els altres', async () => {
    const { result } = await mount({ accepts: (m) => m.id === makeMessage(3).id });

    await act(async () => mockSocket.handlers?.onMessage(makeMessage(4, { author: PAU })));
    expect(ids(result.current.items)).toEqual([makeMessage(2).id]);

    await act(async () => mockSocket.handlers?.onMessage(makeMessage(3, { author: PAU })));
    expect(ids(result.current.items)).toEqual([makeMessage(3).id, makeMessage(2).id]);
  });

  it('en enviar passa el payload extra injectat al socket, amb la mateixa clau en reintentar', async () => {
    mockSocket.sendMessage.mockRejectedValueOnce({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
    });
    const { result } = await mount({ sendExtra: { conversation_id: 'c-1' } });

    await act(async () => result.current.send('Hola'));
    expect(mockSocket.sendMessage).toHaveBeenLastCalledWith('Hola', 'uuid-1', {
      conversation_id: 'c-1',
    });

    await act(async () => result.current.retry('uuid-1'));
    expect(mockSocket.sendMessage).toHaveBeenLastCalledWith('Hola', 'uuid-1', {
      conversation_id: 'c-1',
    });
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('el missatge confirmat porta l’id de la sala injectada', async () => {
    const { result } = await mount();

    await act(async () => result.current.send('Hola'));

    const sent = client
      .getQueryData<ChatHistoryData>(HISTORY_KEY)
      ?.pages[0]?.messages.find((m) => m.id === 'ack-1');
    expect(sent).toMatchObject({ room_id: 'conv-1', text: 'Hola' });
  });
});
