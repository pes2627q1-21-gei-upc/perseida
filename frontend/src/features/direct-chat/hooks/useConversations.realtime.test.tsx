import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ServerFrame } from '../../../shared/realtime';
import { listConversations } from '../api/directChat';
import { useConversations } from './useDirectChat';

jest.mock('../api/directChat', () => ({ listConversations: jest.fn() }));

let mockStatus = 'open';
let mockListener: ((frame: ServerFrame) => void) | undefined;
const mockUnsubscribe = jest.fn(() => {
  mockListener = undefined;
});
const mockSubscribe = jest.fn((listener: (frame: ServerFrame) => void) => {
  mockListener = listener;
  return mockUnsubscribe;
});
const mockUseSocket = jest.fn(() => ({ status: mockStatus, subscribePrivate: mockSubscribe }));
jest.mock('../../../shared/realtime', () => ({ useSocket: () => mockUseSocket() }));
jest.mock('../../auth/socketAuth', () => ({ socketAuth: {} }));

const A = '01900000-0000-7000-8000-000000000001';
const B = '01900000-0000-7000-8000-000000000002';
const row = (id: string, unread_count: number) => ({
  conversation_id: id,
  other_user_id: '01900000-0000-7000-8000-000000000099',
  other_display_name: 'Laia',
  other_avatar_url: null,
  last_message_preview: 'Hola',
  last_message_at: '2026-11-22T12:00:00Z',
  last_message_sender_id: '01900000-0000-7000-8000-000000000099',
  unread_count,
  blocked_by_me: false,
  created_at: '2026-11-22T11:00:00Z',
});
const incoming = (conversationId: string): ServerFrame => ({
  type: 'dm.message',
  payload: {
    id: '01900000-0000-7000-8000-000000000055',
    conversation_id: conversationId,
    sender_id: '01900000-0000-7000-8000-000000000099',
    text: 'Hola',
    sent_at: '2026-11-22T12:00:00Z',
  },
});

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mockStatus = 'open';
  mockListener = undefined;
  jest.clearAllMocks();
  jest.mocked(listConversations).mockResolvedValue([row(A, 1), row(B, 2)]);
});
afterEach(() => client.clear());

describe('TG-65 criterion 11: live conversation list', () => {
  it('keeps a private listener while the list is mounted and releases it afterwards', async () => {
    const { unmount } = await renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(mockListener).toEqual(expect.any(Function)));
    expect(mockUseSocket).toHaveBeenCalled();
    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('refreshes both the affected badge and total when a message arrives without opening a chat', async () => {
    const { result } = await renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([row(A, 1), row(B, 2)]));
    await waitFor(() => expect(mockListener).toEqual(expect.any(Function)));
    jest.mocked(listConversations).mockResolvedValue([row(B, 3), row(A, 1)]);

    await act(async () => mockListener?.(incoming(B)));

    await waitFor(() => expect(result.current.data).toEqual([row(B, 3), row(A, 1)]));
    expect(result.current.data?.reduce((sum, item) => sum + item.unread_count, 0)).toBe(4);
  });

  it('refreshes the inbox after reconnecting so messages missed while offline are counted', async () => {
    const { result, rerender } = await renderHook(
      ({ status }: { status: string }) => {
        mockStatus = status;
        return useConversations();
      },
      { wrapper, initialProps: { status: 'open' } },
    );
    await waitFor(() => expect(result.current.data).toEqual([row(A, 1), row(B, 2)]));
    await rerender({ status: 'reconnecting' });
    jest.mocked(listConversations).mockResolvedValue([row(B, 5), row(A, 1)]);
    await rerender({ status: 'open' });

    await waitFor(() => expect(result.current.data).toEqual([row(B, 5), row(A, 1)]));
  });
});

describe('TG-65 criterion 11: ignore unrelated realtime events', () => {
  it('does not invalidate or refetch the conversation list when someone is typing', async () => {
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([row(A, 1), row(B, 2)]));
    await waitFor(() => expect(mockListener).toEqual(expect.any(Function)));
    spy.mockClear();
    jest.mocked(listConversations).mockClear();
    await act(async () =>
      mockListener?.({
        type: 'dm.typing',
        payload: { conversation_id: A, is_typing: true },
      }),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(listConversations).not.toHaveBeenCalled();
  });
});
