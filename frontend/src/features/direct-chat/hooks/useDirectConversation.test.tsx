import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { AppError } from '../../../shared/errors';
import type { ServerFrame } from '../../../shared/realtime';
import { useDirectConversation } from './useDirectConversation';

const mockSend = jest.fn();
const mockHistory = jest.fn();
const mockMarkRead = jest.fn();
let mockIsFocused = true;
let appStateListeners: ((state: AppStateStatus) => void)[] = [];
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
let mockListener: ((frame: ServerFrame) => void) | undefined;
jest.mock('expo-router', () => ({ useIsFocused: () => mockIsFocused }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'client-id-1') }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error' },
}));
jest.mock('../../../shared/realtime', () => ({
  useSocket: () => ({
    status: 'open',
    error: null,
    reconnect: jest.fn(),
    send: mockSend,
    subscribePrivate: (listener: (frame: ServerFrame) => void) => {
      mockListener = listener;
      return () => {
        mockListener = undefined;
      };
    },
  }),
}));
jest.mock('../../auth/socketAuth', () => ({ socketAuth: {} }));
jest.mock('../../auth/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { id: 'me', display_name: 'Jo' }, isPending: false, error: null }),
}));
jest.mock('./useDirectChat', () => ({
  directChatKeys: {
    conversations: ['direct-chat', 'conversations'],
    messages: (id: string) => ['direct-chat', 'messages', id],
  },
  useDirectMessages: () => mockHistory(),
  useMarkRead: () => ({ mutate: mockMarkRead }),
}));

const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const OTHER = '01900000-0000-7000-8000-000000000004';
const message = {
  id: 'message-1',
  conversation_id: CONVERSATION,
  sender_id: 'other',
  text: 'Hola',
  sent_at: '2026-11-22T12:00:00Z',
};
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockIsFocused = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mockListener = undefined;
  jest.clearAllMocks();
  appStateListeners = [];
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    writable: true,
    value: 'active',
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as never;
  });
  mockHistory.mockReturnValue({
    data: { pages: [{ messages: [], next_cursor: null }], pageParams: [undefined] },
    isPending: false,
    error: null,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: jest.fn().mockResolvedValue({
      data: { pages: [{ messages: [], next_cursor: null }], pageParams: [undefined] },
      isError: false,
    }),
    fetchNextPage: jest.fn(),
  });
  mockSend.mockResolvedValue({
    type: 'dm.send',
    payload: { id: 'message-2', sent_at: '2026-11-22T12:01:00Z' },
  });
});
afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
  Object.defineProperty(AppState, 'currentState', originalAppState);
});

describe('useDirectConversation (TG-65 criteria 5, 9, 11)', () => {
  it('uses the other participant name for messages loaded from history', async () => {
    mockHistory.mockReturnValue({
      ...mockHistory(),
      data: { pages: [{ messages: [message], next_cursor: null }], pageParams: [undefined] },
    });
    const { result } = await renderHook(() => useDirectConversation(CONVERSATION, 'Anna'), {
      wrapper,
    });
    expect(result.current.items).toContainEqual(
      expect.objectContaining({
        kind: 'message',
        message: expect.objectContaining({ author: { id: 'other', name: 'Anna' } }),
      }),
    );
  });

  it('does not mark messages read in background and reloads before marking on return', async () => {
    let finish!: (result: unknown) => void;
    const data = { pages: [{ messages: [], next_cursor: null }], pageParams: [undefined] };
    const refetch = jest
      .fn()
      .mockResolvedValueOnce({ data, isError: false })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
    mockHistory.mockReturnValue({ ...mockHistory(), refetch });
    await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith(CONVERSATION));
    mockMarkRead.mockClear();
    await act(async () => {
      appStateListeners.forEach((listener) => listener('background'));
    });
    await act(async () => {
      mockListener?.({ type: 'dm.message', payload: message });
    });
    expect(mockMarkRead).not.toHaveBeenCalled();
    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
    });
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
    expect(mockMarkRead).not.toHaveBeenCalled();
    await act(async () => {
      finish({ data, isError: false });
    });
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith(CONVERSATION));
  });
  it('does not mark read when a history request completes after focus was lost', async () => {
    let finish!: (result: unknown) => void;
    const refetch = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mockHistory.mockReturnValue({ ...mockHistory(), refetch });
    const { rerender } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    mockIsFocused = false;
    await rerender(undefined);
    await act(async () => {
      finish({ data: { pages: [], pageParams: [] }, isError: false });
    });
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('does not mark the old conversation read when its history completes after switching', async () => {
    const resolvers: ((result: unknown) => void)[] = [];
    const refetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    mockHistory.mockReturnValue({ ...mockHistory(), refetch });
    const { rerender } = await renderHook(({ id }: { id: string }) => useDirectConversation(id), {
      wrapper,
      initialProps: { id: CONVERSATION },
    });
    await waitFor(() => expect(resolvers).toHaveLength(1));
    await rerender({ id: OTHER });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => {
      resolvers[0]?.({ data: { pages: [], pageParams: [] }, isError: false });
    });
    expect(mockMarkRead).not.toHaveBeenCalledWith(CONVERSATION);
    await act(async () => {
      resolvers[1]?.({ data: { pages: [], pageParams: [] }, isError: false });
    });
    expect(mockMarkRead).toHaveBeenCalledWith(OTHER);
  });

  it('does not mark a background conversation read, including when a message arrives', async () => {
    mockIsFocused = false;
    mockHistory.mockReturnValue({
      ...mockHistory(),
      refetch: jest.fn().mockResolvedValue({
        data: { pages: [{ messages: [], next_cursor: null }], pageParams: [undefined] },
        isError: false,
      }),
    });
    await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await act(async () => {
      mockListener?.({ type: 'dm.message', payload: message });
    });
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('does not mark the conversation read when fetching history fails', async () => {
    const error = new AppError({
      kind: 'http',
      code: 'DATABASE_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
    mockHistory.mockReturnValue({
      ...mockHistory(),
      data: undefined,
      error,
      isPending: false,
      refetch: jest.fn().mockResolvedValue({ data: undefined, error, isError: true }),
    });
    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    expect(result.current.error).toBe(error);
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('waits for history to reload successfully before marking read on connection', async () => {
    let finish!: (result: unknown) => void;
    const refetch = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mockHistory.mockReturnValue({ ...mockHistory(), refetch });
    await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(mockMarkRead).not.toHaveBeenCalled();
    await act(async () => {
      finish({
        data: { pages: [{ messages: [], next_cursor: null }], pageParams: [undefined] },
        isError: false,
      });
    });
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith(CONVERSATION));
  });
  it('exposes persisted history and marks the open conversation as read', async () => {
    mockHistory.mockReturnValue({
      data: { pages: [{ messages: [message], next_cursor: null }], pageParams: [undefined] },
      isPending: false,
      error: null,
      isFetching: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: jest.fn().mockResolvedValue({
        data: { pages: [{ messages: [message], next_cursor: null }], pageParams: [undefined] },
        isError: false,
      }),
      fetchNextPage: jest.fn(),
    });
    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    expect(result.current.items).toContainEqual(
      expect.objectContaining({
        kind: 'message',
        message: expect.objectContaining({ id: message.id, text: 'Hola' }),
      }),
    );
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith(CONVERSATION));
  });

  it('signals only new incoming websocket messages, not history, own events or duplicates', async () => {
    mockHistory.mockReturnValue({
      data: { pages: [{ messages: [message], next_cursor: null }], pageParams: [undefined] },
      isPending: false,
      error: null,
      isFetching: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: jest.fn().mockResolvedValue({
        data: { pages: [{ messages: [message], next_cursor: null }], pageParams: [undefined] },
        isError: false,
      }),
      fetchNextPage: jest.fn(),
    });
    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    expect(result.current.lastIncoming).toBeUndefined();
    await act(async () => {
      mockListener?.({ type: 'dm.message', payload: message });
    });
    expect(result.current.lastIncoming).toBeUndefined();
    await act(async () => {
      mockListener?.({ type: 'dm.message', payload: { ...message, id: 'own', sender_id: 'me' } });
    });
    expect(result.current.lastIncoming).toBeUndefined();
    const live = { ...message, id: 'fresh', text: 'Nou' };
    await act(async () => {
      mockListener?.({ type: 'dm.message', payload: live });
    });
    expect(result.current.lastIncoming).toEqual(live);
    const reference = result.current.lastIncoming;
    await act(async () => {
      mockListener?.({ type: 'dm.message', payload: live });
    });
    expect(result.current.lastIncoming).toBe(reference);
  });

  it('does not reannounce an old event after leaving and returning to a conversation', async () => {
    const { result, rerender } = await renderHook(
      ({ id }: { id: string }) => useDirectConversation(id),
      { wrapper, initialProps: { id: CONVERSATION } },
    );
    await act(async () => {
      mockListener?.({ type: 'dm.message', payload: message });
    });
    expect(result.current.lastIncoming).toEqual(message);
    await rerender({ id: OTHER });
    expect(result.current.lastIncoming).toBeUndefined();
    await rerender({ id: CONVERSATION });
    expect(result.current.lastIncoming).toBeUndefined();
  });

  it('sends dm.send with conversation, text and a client-generated id', async () => {
    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await act(async () => {
      await result.current.send('Hola');
    });
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith({
        type: 'dm.send',
        payload: { conversation_id: CONVERSATION, text: 'Hola', client_message_id: 'client-id-1' },
      }),
    );
    await waitFor(() =>
      expect(
        result.current.items.some(
          (item) => item.kind === 'message' && item.message.id === 'message-2',
        ),
      ).toBe(true),
    );
  });

  it('shows a private event only in its own conversation and deduplicates it', async () => {
    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await act(async () => {
      mockListener?.({ type: 'dm.message', payload: { ...message, conversation_id: OTHER } });
      mockListener?.({ type: 'dm.message', payload: message });
      mockListener?.({ type: 'dm.message', payload: message });
    });
    const messages = result.current.items.filter((item) => item.kind === 'message');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ message: { id: message.id, text: 'Hola' }, mine: false });
  });

  it('never shows an earlier conversation send in the new conversation after a late ack', async () => {
    let resolveSend!: (value: { type: string; payload: { id: string; sent_at: string } }) => void;
    mockSend.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    const { result, rerender } = await renderHook(
      ({ id }: { id: string }) => useDirectConversation(id),
      { wrapper, initialProps: { id: CONVERSATION } },
    );
    let pendingSend!: Promise<unknown>;
    await act(async () => {
      pendingSend = result.current.send('Només a A');
    });
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ kind: 'pending', text: 'Només a A' }),
    );

    await rerender({ id: OTHER });
    expect(result.current.items).not.toContainEqual(
      expect.objectContaining({ kind: 'pending', text: 'Només a A' }),
    );
    await act(async () => {
      resolveSend({ type: 'dm.send', payload: { id: 'late-message-a', sent_at: message.sent_at } });
      await pendingSend;
    });
    expect(result.current.items).not.toContainEqual(
      expect.objectContaining({
        kind: 'message',
        message: expect.objectContaining({ id: 'late-message-a' }),
      }),
    );
    expect(result.current.items).not.toContainEqual(
      expect.objectContaining({ kind: 'pending', text: 'Només a A' }),
    );
  });

  it('keeps a refused send as a failed message with the server error', async () => {
    mockSend.mockRejectedValue(
      new AppError({ kind: 'http', code: 'USER_BLOCKED', status: 403, retryable: false }),
    );
    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await act(async () => {
      await result.current.send('Hola');
    });
    await waitFor(() =>
      expect(result.current.items).toContainEqual(
        expect.objectContaining({
          kind: 'pending',
          status: 'failed',
          error: { code: 'USER_BLOCKED', retryable: false },
        }),
      ),
    );
  });

  it('uses the same client id when retrying an uncertain send', async () => {
    mockSend
      .mockRejectedValueOnce(
        new AppError({ kind: 'network', code: 'SEND_UNCERTAIN', retryable: true }),
      )
      .mockResolvedValueOnce({
        type: 'dm.send',
        payload: { id: 'message-2', sent_at: '2026-11-22T12:01:00Z' },
      });
    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await act(async () => {
      await result.current.send('Hola');
    });
    await waitFor(() =>
      expect(result.current.items).toContainEqual(
        expect.objectContaining({ kind: 'pending', status: 'uncertain' }),
      ),
    );
    await act(async () => {
      await result.current.retry('client-id-1');
    });
    expect(mockSend.mock.calls[0]?.[0]).toEqual(mockSend.mock.calls[1]?.[0]);
  });
});
