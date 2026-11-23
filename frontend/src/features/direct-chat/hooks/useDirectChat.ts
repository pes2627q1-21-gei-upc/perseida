import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { AppError } from '../../../shared/errors';
import { useSocket } from '../../../shared/realtime';
import { socketAuth } from '../../auth/socketAuth';
import {
  blockUser,
  type ConversationOverview,
  type DirectHistory,
  fetchMessages,
  listConversations,
  markRead,
  openConversation,
  unblockUser,
} from '../api/directChat';

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

export function useDirectMessages(conversationId: string) {
  return useInfiniteQuery<
    DirectHistory,
    AppError,
    { pages: DirectHistory[]; pageParams: (string | undefined)[] },
    ReturnType<typeof directChatKeys.messages>,
    string | undefined
  >({
    queryKey: directChatKeys.messages(conversationId),
    queryFn: ({ pageParam }) => fetchMessages(conversationId, pageParam),
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
