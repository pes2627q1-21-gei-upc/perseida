import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import { type ChatHistory, type ChatRoom, fetchMessages, listRooms } from '../api/chat';

export const chatKeys = {
  all: ['chat'] as const,
  rooms: ['chat', 'rooms'] as const,
  messages: (eventId: string) => [...chatKeys.all, 'messages', eventId] as const,
};

// One retry, and only when the error is transient (network, 408, 429, 5xx).
function retryOnceIfTransient(failureCount: number, error: AppError): boolean {
  return failureCount < 1 && error.retryable;
}

/** Rooms of the user, with their last message. Online only. */
export function useRooms() {
  return useQuery<ChatRoom[], AppError>({
    queryKey: chatKeys.rooms,
    queryFn: listRooms,
    retry: retryOnceIfTransient,
  });
}

/**
 * History of an event chat, newest first, one page per cursor. Online only. `enabled` waits for
 * the room to be open: the history of a room that does not exist yet is a CHAT_ROOM_NOT_FOUND.
 */
export function useRoomMessages(eventId: string, enabled = true) {
  return useInfiniteQuery<
    ChatHistory,
    AppError,
    { pages: ChatHistory[]; pageParams: (string | undefined)[] },
    ReturnType<typeof chatKeys.messages>,
    string | undefined
  >({
    queryKey: chatKeys.messages(eventId),
    queryFn: ({ pageParam }) => fetchMessages(eventId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!eventId && enabled,
    retry: retryOnceIfTransient,
  });
}
