import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { blockUser, openConversation, unblockUser } from '../api/directChat';
import { directChatKeys, useBlockUser, useOpenConversation, useUnblockUser } from './useDirectChat';

jest.mock('../api/directChat', () => ({
  blockUser: jest.fn(),
  openConversation: jest.fn(),
  unblockUser: jest.fn(),
}));

const OTHER = '01900000-0000-7000-8000-000000000004';
const OTHER_QUERY = ['unrelated', 'data'];
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(directChatKeys.conversations, []);
  client.setQueryData(OTHER_QUERY, ['kept']);
  jest.clearAllMocks();
});
afterEach(() => client.clear());

describe('TG-65 criteria 2, 10 and 12: direct-chat mutations', () => {
  it.each([
    ['opening', useOpenConversation, jest.mocked(openConversation), { id: 'conversation' }],
    ['blocking', useBlockUser, jest.mocked(blockUser), undefined],
    ['unblocking', useUnblockUser, jest.mocked(unblockUser), undefined],
  ] as const)('%s calls the matching API and invalidates only the inbox on success', async (_name, useMutation, api, response) => {
    api.mockResolvedValue(response as never);
    const { result, unmount } = await renderHook(() => useMutation(), { wrapper });
    await act(async () => { await result.current.mutateAsync(OTHER); });
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0]?.[0]).toBe(OTHER);
    expect(client.getQueryState(directChatKeys.conversations)?.isInvalidated).toBe(true);
    expect(client.getQueryState(OTHER_QUERY)?.isInvalidated).toBe(false);
    await unmount();
  });

  it.each([
    ['opening', useOpenConversation, jest.mocked(openConversation)],
    ['blocking', useBlockUser, jest.mocked(blockUser)],
    ['unblocking', useUnblockUser, jest.mocked(unblockUser)],
  ] as const)('%s preserves the failure and does not invalidate the inbox', async (_name, useMutation, api) => {
    const error = new Error('Synthetic API failure');
    api.mockRejectedValue(error);
    const { result, unmount } = await renderHook(() => useMutation(), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync(OTHER)).rejects.toBe(error); });
    expect(client.getQueryState(directChatKeys.conversations)?.isInvalidated).toBe(false);
    expect(client.getQueryState(OTHER_QUERY)?.isInvalidated).toBe(false);
    await unmount();
  });
});
