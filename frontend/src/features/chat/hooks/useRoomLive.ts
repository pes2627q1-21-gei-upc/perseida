import { useQuery } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import { type ChatRoom, ensureRoom } from '../api/chat';
import { chatKeys, useRoomMessages } from './useChat';
import { useChatSocket } from './useChatSocket';
import { type UseLiveTransport, useLiveConversation } from './useLiveConversation';

/** The live channel of an event: its socket room (`chat:event:<eventId>`), joined as is. */
const useEventTransport: UseLiveTransport = (handlers, joinAttempt, room) =>
  useChatSocket(room, handlers, joinAttempt);

// One retry, and only when the error is transient (network, 408, 429, 5xx).
function retryOnceIfTransient(failureCount: number, error: AppError): boolean {
  return failureCount < 1 && error.retryable;
}

/**
 * The room of an event, live (TG-469): opens it (PUT), loads its history and joins its live room
 * `chat:event:<eventId>`. How it works is in useLiveConversation.
 */
export function useRoomLive(eventId: string) {
  const room = useQuery<ChatRoom, AppError>({
    queryKey: [...chatKeys.all, 'room', eventId],
    queryFn: () => ensureRoom(eventId),
    retry: retryOnceIfTransient,
  });
  const history = useRoomMessages(eventId, room.isSuccess);
  return useLiveConversation({
    room,
    history,
    historyKey: chatKeys.messages(eventId),
    useTransport: useEventTransport,
    transportTarget: `chat:event:${eventId}`,
  });
}
