import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import type { AppError } from '../../../shared/errors';
import { useSocket } from '../../../shared/realtime';
import { socketAuth } from '../../auth/socketAuth';
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
  const client = useQueryClient();
  const { status, subscribePrivate } = useSocket(socketAuth);
  const previousStatus = useRef(status);
  useEffect(
    () =>
      subscribePrivate((frame) => {
        if (frame.type === 'dm.message') {
          void client.invalidateQueries({ queryKey: directChatKeys.conversations });
        }
      }),
    [client, subscribePrivate],
  );
  useEffect(() => {
    if (status === 'open' && previousStatus.current !== 'open') {
      void client.invalidateQueries({ queryKey: directChatKeys.conversations });
    }
    previousStatus.current = status;
  }, [client, status]);
  return useQuery<ConversationOverview[], AppError>({
    queryKey: directChatKeys.conversations,
    queryFn: listConversations,
    retry: retryOnceIfTransient,
  });
}

/** Who is who in a conversation, so that the history can name the other participant. */
export interface DirectParticipants {
  /** The signed-in user: their messages keep no name (the bubble says "you"). */
  meId?: string;
  /** The other participant's display name, put on the messages the signed-in user did not write. */
  otherName?: string;
}

/**
 * History of a direct conversation, newest first, one page per cursor. It is cached as
 * `ChatHistory` (the shape the chat core reads and adds live messages to), not as the API sends it:
 * the API does not carry names, so `participants` gives the other one's to what they wrote.
 */
export function useDirectMessages(conversationId: string, participants?: DirectParticipants) {
  const { meId, otherName } = participants ?? {};
  const select = useCallback(
    (data: ChatHistoryData): ChatHistoryData =>
      !otherName || !meId
        ? data
        : {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              messages: page.messages.map((message) =>
                message.author.id === meId
                  ? message
                  : { ...message, author: { ...message.author, name: otherName } },
              ),
            })),
          },
    [meId, otherName],
  );
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
    select,
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
