import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type AppError, NETWORK_ERROR_CODE } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/api/getCurrentUser';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { type ChatMessage, type ChatRoom, ensureRoom } from '../api/chat';
import { addMessage, type ChatHistoryData, flattenMessages } from '../chatCache';
import { buildChatItems, type OutgoingMessage, type SendFailure } from '../chatItems';
import { chatKeys, useRoomMessages } from './useChat';
import { type SentChatMessage, useChatSocket } from './useChatSocket';

/** Refused to join the live room or to write in it: the same as being taken out of it. */
const FORBIDDEN = 'FORBIDDEN';
/** The server does not count this connection in the room: it has to join it again. */
const NOT_SUBSCRIBED = 'NOT_SUBSCRIBED';

/**
 * Whether a send that did not go through was stored. A refusal (4xx) or a message that never
 * left (NETWORK_ERROR) was not: it `failed`. Anything else (no answer, SEND_UNCERTAIN, or a 5xx
 * such as PUBSUB_UNAVAILABLE after storing it) may have been: it is `uncertain`, and its retry
 * with the same `clientMessageId` does not duplicate it.
 */
function outcomeOf(error: AppError): 'failed' | 'uncertain' {
  if (error.code === NETWORK_ERROR_CODE) return 'failed';
  return error.status !== undefined && error.status < 500 ? 'failed' : 'uncertain';
}

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
 * confirms it; a refused one stays `failed` with its reason, and one that may have been stored
 * stays `uncertain`. Both are retried with the same `clientMessageId`, so the server does not
 * store them twice; a failed one can also be discarded. Sending never rejects: the bubble is
 * where the outcome lives. The room waits to know who is signed in, so a message of mine is
 * always mine.
 */
export function useRoomLive(eventId: string) {
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const me = currentUser.data;
  const room = useQuery<ChatRoom, AppError>({
    queryKey: [...chatKeys.all, 'room', eventId],
    queryFn: () => ensureRoom(eventId),
    retry: retryOnceIfTransient,
  });
  const history = useRoomMessages(eventId, room.isSuccess);
  const [pending, setPending] = useState<OutgoingMessage[]>([]);
  // Joining the live room was refused: without it nothing arrives, so the room shows the error.
  const [socketError, setSocketError] = useState<AppError | null>(null);
  const [revoked, setRevoked] = useState(false);
  // Each new attempt leaves the live room and joins it again (useChatSocket).
  const [joinAttempt, setJoinAttempt] = useState(0);
  // A NOT_SUBSCRIBED send joins again by itself once, until a message goes through.
  const rejoinedBySend = useRef(false);

  const rejoin = useCallback(() => setJoinAttempt((attempt) => attempt + 1), []);

  // What was said while this client was not in the live room never arrives by the socket: the
  // history is asked for again. A refetch keeps the loaded pages (TanStack asks for each one
  // again from the newest, so the list does not jump) and one already on its way is not restarted
  // (a connection that flaps does not make a storm). What arrived live is in the history by id.
  const { refetch: refetchHistory } = history;
  const catchUp = useCallback(
    () => void refetchHistory({ cancelRefetch: false }),
    [refetchHistory],
  );

  const takeOut = useCallback(() => {
    setRevoked(true);
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms });
    void queryClient.invalidateQueries({ queryKey: chatKeys.subscriptions });
  }, [queryClient]);

  const socket = useChatSocket(
    eventId,
    {
      onMessage: (message) =>
        queryClient.setQueryData<ChatHistoryData>(chatKeys.messages(eventId), (cached) =>
          addMessage(cached, message),
        ),
      onRevoked: takeOut,
      onError: (error) => {
        if (error.code === FORBIDDEN) takeOut();
        else setSocketError(error);
      },
    },
    joinAttempt,
  );

  // The connection coming back after a drop (not its first opening) is a gap in the room.
  const { status } = socket;
  const wasOpen = useRef(false);
  const dropped = useRef(false);
  const roomOpen = room.isSuccess;
  useEffect(() => {
    if (status === 'open') {
      wasOpen.current = true;
      if (dropped.current && roomOpen) {
        dropped.current = false;
        catchUp();
      }
    } else if (wasOpen.current) {
      dropped.current = true;
    }
  }, [catchUp, roomOpen, status]);

  const roomId = room.data?.id;
  const { sendMessage } = socket;

  /** The new state of a bubble: its status and, when it failed, why. */
  const mark = useCallback(
    (clientMessageId: string, status: OutgoingMessage['status'], error?: SendFailure) => {
      setPending((current) =>
        current.map((outgoing) =>
          outgoing.clientMessageId === clientMessageId
            ? { clientMessageId, text: outgoing.text, status, ...(error && { error }) }
            : outgoing,
        ),
      );
    },
    [],
  );

  const refused = useCallback(
    (clientMessageId: string, error: AppError) => {
      if (outcomeOf(error) === 'uncertain') {
        // It may be stored: the bubble says so and offers the retry; nothing is lost.
        mark(clientMessageId, 'uncertain');
        return;
      }
      haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      if (error.code === NOT_SUBSCRIBED) {
        // Retrying works once the room is joined again: join it now, once.
        mark(clientMessageId, 'failed', { code: error.code, retryable: true });
        if (!rejoinedBySend.current) {
          rejoinedBySend.current = true;
          rejoin();
          catchUp();
        }
        return;
      }
      mark(clientMessageId, 'failed', { code: error.code, retryable: error.retryable });
      if (error.code === FORBIDDEN) takeOut();
    },
    [catchUp, mark, rejoin, takeOut],
  );

  const deliver = useCallback(
    async (author: CurrentUser, text: string, clientMessageId: string) => {
      let ack: SentChatMessage;
      try {
        ack = await sendMessage(text, clientMessageId);
      } catch (caught) {
        // The socket client only rejects with an AppError (socketClient.send).
        refused(clientMessageId, caught as AppError);
        return;
      }
      rejoinedBySend.current = false;
      const message: ChatMessage = {
        id: ack.id,
        room_id: roomId ?? '',
        author: { id: author.id, name: author.display_name },
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
    [eventId, queryClient, refused, roomId, sendMessage],
  );

  /**
   * Sends a message. Resolves as soon as its bubble takes it, so the composer clears; the
   * outcome lives in the bubble. Nothing is sent before knowing who is signed in.
   */
  const send = useCallback(
    async (text: string) => {
      if (!me) return;
      const clientMessageId = Crypto.randomUUID();
      setPending((current) => [{ clientMessageId, text, status: 'sending' }, ...current]);
      void deliver(me, text, clientMessageId);
    },
    [deliver, me],
  );

  /** Sends a failed or uncertain message again, with its own `clientMessageId`. */
  const retry = useCallback(
    async (clientMessageId: string) => {
      const outgoing = pending.find((candidate) => candidate.clientMessageId === clientMessageId);
      if (!outgoing || !me) return;
      mark(clientMessageId, 'sending');
      await deliver(me, outgoing.text, clientMessageId);
    },
    [deliver, mark, me, pending],
  );

  /** Drops a refused message from the room. */
  const discard = useCallback((clientMessageId: string) => {
    setPending((current) =>
      current.filter((outgoing) => outgoing.clientMessageId !== clientMessageId),
    );
  }, []);

  /** Asks again for what failed: who is signed in, the room, the history and the live room. */
  const reload = useCallback(() => {
    if (socketError) rejoin();
    setSocketError(null);
    if (currentUser.isError) void currentUser.refetch();
    void room.refetch().then(() => history.refetch());
  }, [currentUser, history, rejoin, room, socketError]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loadOlder = useCallback(() => {
    // Also without a re-render in between (two scroll ends in a row), a page on its way is kept,
    // not cancelled and asked for again.
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const myUserId = me?.id ?? '';
  const items = useMemo(
    () => buildChatItems({ messages: flattenMessages(history.data), myUserId, pending }),
    [history.data, myUserId, pending],
  );

  // A failed older page or a failed refetch keeps the history on screen: only what stops the
  // room from opening is an error of the room.
  const error =
    (me ? null : currentUser.error) ??
    (room.data ? null : room.error) ??
    (history.data ? null : history.error) ??
    socketError;

  return {
    items,
    isLoading: !error && (currentUser.isPending || room.isPending || history.isPending),
    error,
    revoked,
    status: socket.status,
    reconnect: socket.reconnect,
    send,
    retry,
    discard,
    hasMore: hasNextPage,
    isFetchingMore: isFetchingNextPage,
    loadOlder,
    reload,
  };
}
