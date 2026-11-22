import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppError } from '../../../shared/errors';
import { fetchMessages, listConversations, markRead } from '../api/directChat';
import { directChatKeys, useConversations, useDirectMessages, useMarkRead } from './useDirectChat';

jest.mock('../api/directChat', () => ({
  fetchMessages: jest.fn(),
  listConversations: jest.fn(),
  markRead: jest.fn(),
}));

const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const message = (id: string) => ({
  id,
  conversation_id: CONVERSATION,
  sender_id: 'user-1',
  text: 'Hola',
  sent_at: '2026-11-22T12:00:00Z',
});
const first = { messages: [message('new')], next_cursor: 'cursor-1' };
const second = { messages: [message('older')], next_cursor: null };
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  jest.clearAllMocks();
});
afterEach(() => client.clear());

describe('direct-chat queries (TG-65 criteria 9–11)', () => {
  it('exposes loading until the conversation list arrives', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof listConversations>>) => void;
    jest.mocked(listConversations).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result } = await renderHook(() => useConversations(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      resolve([]);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('exposes the conversation list, including an empty list', async () => {
    jest.mocked(listConversations).mockResolvedValue([]);
    const { result } = await renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(client.getQueryData(directChatKeys.conversations)).toEqual([]);
  });

  it('exposes an AppError instead of an empty list on failure', async () => {
    const error = new AppError({
      kind: 'http',
      code: 'ACCOUNT_SUSPENDED',
      status: 403,
      retryable: false,
    });
    jest.mocked(listConversations).mockRejectedValue(error);
    const { result } = await renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();
  });

  it('loads history pages using the next cursor and stops at null', async () => {
    jest.mocked(fetchMessages).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result } = await renderHook(() => useDirectMessages(CONVERSATION), {
      wrapper,
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(fetchMessages).toHaveBeenNthCalledWith(1, CONVERSATION, undefined);
    expect(fetchMessages).toHaveBeenNthCalledWith(2, CONVERSATION, 'cursor-1');
    expect(result.current.data?.pages).toEqual([first, second]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('does not fetch history for an empty conversation id', async () => {
    const { result } = await renderHook(() => useDirectMessages(''), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it('refreshes the conversation list after marking a conversation read', async () => {
    client.setQueryData(directChatKeys.conversations, []);
    jest.mocked(markRead).mockResolvedValue(undefined);
    const { result } = await renderHook(() => useMarkRead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(CONVERSATION);
    });
    expect(markRead).toHaveBeenCalledWith(CONVERSATION);
    expect(client.getQueryState(directChatKeys.conversations)?.isInvalidated).toBe(true);
  });

  it('does not report a successful read or invalidate on a rejected request', async () => {
    client.setQueryData(directChatKeys.conversations, []);
    const error = new AppError({
      kind: 'http',
      code: 'CONVERSATION_NOT_FOUND',
      status: 404,
      retryable: false,
    });
    jest.mocked(markRead).mockRejectedValue(error);
    const { result } = await renderHook(() => useMarkRead(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(CONVERSATION)).rejects.toBe(error);
    });
    expect(client.getQueryState(directChatKeys.conversations)?.isInvalidated).toBe(false);
  });
});
