import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';

import type { AppError } from '../../../shared/errors';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { type ChatMessage, type ChatRoom, ensureRoom } from '../api/chat';
import { addMessage, type ChatHistoryData, flattenMessages } from '../chatCache';
import { buildChatItems, type OutgoingMessage } from '../chatItems';
import { chatKeys, useRoomMessages } from './useChat';
import { type SentChatMessage, useChatSocket } from './useChatSocket';

/** The server lost the answer to a send: the message may be stored, so it is not an error. */
const SEND_UNCERTAIN = 'SEND_UNCERTAIN';
/** Refused to join the live room: the same as being taken out of it. */
const FORBIDDEN = 'FORBIDDEN';

// One retry, and only when the error is transient (network, 408, 429, 5xx).
function retryOnceIfTransient(failureCount: number, error: AppError): boolean {
  return failureCount < 1 && error.retryable;
}

/**
 * Haptics are a bonus: missing on the web and on some devices, where they reject or throw. They
 * never get in the way of the message.
 */
function haptic(play: () => Promise<void>) {
  try {
    void play().catch(() => undefined);
  } catch {
    // No haptics on this platform.
  }
}

/**
 * The room of an event, live (TG-469): opens it (PUT), loads its history, joins its live room
 * and adds what arrives, and sends the person's messages. A message is pending until the server
 * confirms it; a refused one stays `failed` with the error, and one whose answer was lost stays
 * `uncertain`. Both are retried with the same `clientMessageId`, so the server does not store
 * them twice.
 */
export function useRoomLive(eventId: string) {
  const queryClient = useQueryClient();
  const me = useCurrentUser().data;
  const room = useQuery<ChatRoom, AppError>({
    queryKey: [...chatKeys.all, 'room', eventId],
    queryFn: () => ensureRoom(eventId),
    retry: retryOnceIfTransient,
  });
  const history = useRoomMessages(eventId);
  const [pending, setPending] = useState<OutgoingMessage[]>([]);
  const [sendError, setSendError] = useState<AppError | null>(null);
  const [revoked, setRevoked] = useState(false);

  const takeOut = useCallback(() => {
    setRevoked(true);
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms });
  }, [queryClient]);

  const socket = useChatSocket(eventId, {
    onMessage: (message) =>
      queryClient.setQueryData<ChatHistoryData>(chatKeys.messages(eventId), (cached) =>
        addMessage(cached, message),
      ),
    onRevoked: takeOut,
    onError: (error) => {
      if (error.code === FORBIDDEN) takeOut();
    },
  });

  const roomId = room.data?.id;
  const { sendMessage } = socket;

  const mark = useCallback((clientMessageId: string, status: OutgoingMessage['status']) => {
    setPending((current) =>
      current.map((outgoing) =>
        outgoing.clientMessageId === clientMessageId ? { ...outgoing, status } : outgoing,
      ),
    );
  }, []);

  const deliver = useCallback(
    async (text: string, clientMessageId: string) => {
      setSendError(null);
      let ack: SentChatMessage;
      try {
        ack = await sendMessage(text, clientMessageId);
      } catch (caught) {
        // The socket client only rejects with an AppError (socketClient.send).
        const error = caught as AppError;
        if (error.code === SEND_UNCERTAIN) {
          // It may be stored: the bubble says so and offers the retry; nothing is lost.
          mark(clientMessageId, 'uncertain');
          return;
        }
        mark(clientMessageId, 'failed');
        setSendError(error);
        haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
        throw error;
      }
      const message: ChatMessage = {
        id: ack.id,
        room_id: roomId ?? '',
        author: { id: me?.id ?? '', name: me?.display_name ?? null },
        text,
        sent_at: ack.sent_at,
      };
      queryClient.setQueryData<ChatHistoryData>(chatKeys.messages(eventId), (cached) =>
        addMessage(cached, message),
      );
      setPending((current) =>
        current.filter((outgoing) => outgoing.clientMessageId !== clientMessageId),
      );
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    },
    [eventId, mark, me, queryClient, roomId, sendMessage],
  );

  /** Sends a message. Rejects when the server refuses it, so the composer keeps the text. */
  const send = useCallback(
    async (text: string) => {
      const clientMessageId = Crypto.randomUUID();
      setPending((current) => [{ clientMessageId, text, status: 'sending' }, ...current]);
      await deliver(text, clientMessageId);
    },
    [deliver],
  );

  /** Sends a failed or uncertain message again, with its own `clientMessageId`. */
  const retry = useCallback(
    async (clientMessageId: string) => {
      const outgoing = pending.find((candidate) => candidate.clientMessageId === clientMessageId);
      if (!outgoing) return;
      mark(clientMessageId, 'sending');
      // The bubble shows the outcome: a refused retry is not an error of the caller.
      await deliver(outgoing.text, clientMessageId).catch(() => undefined);
    },
    [deliver, mark, pending],
  );

  const reload = useCallback(() => {
    void room.refetch().then(() => history.refetch());
  }, [room, history]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loadOlder = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const myUserId = me?.id ?? '';
  const items = useMemo(
    () => buildChatItems({ messages: flattenMessages(history.data), myUserId, pending }),
    [history.data, myUserId, pending],
  );

  const error = room.error ?? history.error;

  return {
    items,
    isLoading: !error && (room.isPending || history.isPending),
    error,
    revoked,
    status: socket.status,
    send,
    sendError,
    retry,
    hasMore: hasNextPage,
    isFetchingMore: isFetchingNextPage,
    loadOlder,
    reload,
  };
}
