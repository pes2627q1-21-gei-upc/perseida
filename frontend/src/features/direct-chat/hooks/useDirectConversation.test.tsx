import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppError } from '../../../shared/errors';
import type { ServerFrame } from '../../../shared/realtime';
import { useDirectConversation } from './useDirectConversation';

const mockSend = jest.fn();
const mockHistory = jest.fn();
const mockMarkRead = jest.fn();
let mockListener: ((frame: ServerFrame) => void) | undefined;
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
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mockListener = undefined;
  jest.clearAllMocks();
  mockHistory.mockReturnValue({
    data: { pages: [{ messages: [], next_cursor: null }], pageParams: [undefined] },
    isPending: false,
    error: null,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
  });
  mockSend.mockResolvedValue({
    type: 'dm.send',
    payload: { id: 'message-2', sent_at: '2026-11-22T12:01:00Z' },
  });
});
afterEach(() => client.clear());

describe('useDirectConversation (TG-65 criteria 5, 9, 11)', () => {
  it('isolates pending messages and a late acknowledgement when switching conversations', async () => {
    let finish!: (ack: unknown) => void;
    mockSend.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { result, rerender } = await renderHook(
      ({ id }: { id: string }) => useDirectConversation(id),
      { wrapper, initialProps: { id: CONVERSATION } },
    );
    await act(async () => { await result.current.send('Privat'); });
    expect(result.current.items).toContainEqual(expect.objectContaining({ kind: 'pending', text: 'Privat' }));
    await rerender({ id: OTHER });
    expect(result.current.items).not.toContainEqual(expect.objectContaining({ kind: 'pending', text: 'Privat' }));
    await act(async () => { finish({ type: 'dm.send', payload: { id: 'late-ack', sent_at: '2026-11-22T12:01:00Z' } }); });
    expect(result.current.items).not.toContainEqual(expect.objectContaining({ kind: 'message', message: expect.objectContaining({ id: 'late-ack' }) }));
  });

  it('exposes persisted history and marks the open conversation as read', async () => {
    mockHistory.mockReturnValue({
      data: { pages: [{ messages: [message], next_cursor: null }], pageParams: [undefined] },
      isPending: false,
      error: null,
      isFetching: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: jest.fn(),
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
    mockSend.mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve; }));
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
      expect.objectContaining({ kind: 'message', message: expect.objectContaining({ id: 'late-message-a' }) }),
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
