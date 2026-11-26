import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import type { ChatHistory } from '../../chat/api/chat';
import type { ChatHistoryData } from '../../chat/chatCache';
import {
  blockUser,
  type ConversationOverview,
  fetchMessages,
  listConversations,
  markRead,
  openConversation,
  unblockUser,
} from '../api/directChat';
import { asChatHistory } from '../directMessages';

export const directChatKeys = {
  all: ['direct-chat'] as const,
  conversations: ['direct-chat', 'conversations'] as const,
  messages: (id: string) => ['direct-chat', 'messages', id] as const,
};

function retryOnceIfTransient(failureCount: number, error: AppError): boolean {
  return failureCount < 1 && error.retryable;
}

export function useConversations() {
  return useQuery<ConversationOverview[], AppError>({
    queryKey: directChatKeys.conversations,
    queryFn: listConversations,
    retry: retryOnceIfTransient,
  });
}

/**
 * History of a direct conversation, newest first, one page per cursor. It is cached as
 * `ChatHistory` (the shape the chat core reads and adds live messages to), not as the API sends it.
 */
export function useDirectMessages(conversationId: string) {
  return useInfiniteQuery<
    ChatHistory,
    AppError,
    ChatHistoryData,
    ReturnType<typeof directChatKeys.messages>,
    string | undefined
  >({
    queryKey: directChatKeys.messages(conversationId),
    queryFn: async ({ pageParam }) => asChatHistory(await fetchMessages(conversationId, pageParam)),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!conversationId,
    retry: retryOnceIfTransient,
  });
}

export function useOpenConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: openConversation,
    onSuccess: () => client.invalidateQueries({ queryKey: directChatKeys.conversations }),
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onSuccess: () => client.invalidateQueries({ queryKey: directChatKeys.conversations }),
  });
}

export function useBlockUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: blockUser,
    onSuccess: () => client.invalidateQueries({ queryKey: directChatKeys.conversations }),
  });
}

export function useUnblockUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: unblockUser,
    onSuccess: () => client.invalidateQueries({ queryKey: directChatKeys.conversations }),
  });
}
