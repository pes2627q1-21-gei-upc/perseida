import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import type { ServerFrame } from '../../../shared/realtime';
import { useDirectConversation } from './useDirectConversation';

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
const mockMarkRead = jest.fn();
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
const mockRefetch = jest.fn();
const mockHistory = {
  data: { pages: [{ messages: [], next_cursor: null }], pageParams: [undefined] },
  isPending: false,
  isFetching: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  refetch: mockRefetch,
  fetchNextPage: jest.fn(),
};
let mockListener: ((frame: ServerFrame) => void) | undefined;
const mockSubscribe = (listener: (frame: ServerFrame) => void) => {
  mockListener = listener;
  return () => {
    mockListener = undefined;
  };
};
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'client-id-1') }));
jest.mock('../../../shared/realtime', () => ({
  useSocket: () => ({
    status: 'open',
    reconnect: jest.fn(),
    send: jest.fn(),
    subscribePrivate: mockSubscribe,
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
  // Stable, like a query's: the chat core reacts to a new `data` on every render.
  useDirectMessages: () => mockHistory,
  useMarkRead: () => ({ mutate: mockMarkRead }),
}));

const OPEN = '01900000-0000-7000-8000-000000000001';
const OTHER = '01900000-0000-7000-8000-000000000002';
const key = ['direct-chat', 'conversations'] as const;
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    writable: true,
    value: 'active',
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(key, []);
  mockListener = undefined;
  jest.clearAllMocks();
  mockRefetch.mockResolvedValue({
    data: { pages: [{ messages: [], next_cursor: null }], pageParams: [undefined] },
    isError: false,
  });
});
afterEach(() => {
  client.clear();
  Object.defineProperty(AppState, 'currentState', originalAppState);
});

it('TG-65 criterion 11 invalidates the inbox for a message in another conversation without marking it read', async () => {
  const { result } = await renderHook(() => useDirectConversation(OPEN), { wrapper });
  await waitFor(() => expect(mockListener).toEqual(expect.any(Function)));
  await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  mockMarkRead.mockClear();

  await act(async () =>
    mockListener?.({
      type: 'dm.message',
      payload: {
        id: '01900000-0000-7000-8000-000000000055',
        conversation_id: OTHER,
        sender_id: 'someone-else',
        text: 'Missatge per una altra conversa',
        sent_at: '2026-11-22T12:00:00Z',
      },
    }),
  );

  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(mockMarkRead).not.toHaveBeenCalled();
  expect(result.current.items).toEqual([]);
});
