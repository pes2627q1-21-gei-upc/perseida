import {
  type QueryKey,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  useQueryClient,
} from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { type AppError, NETWORK_ERROR_CODE } from '../../../shared/errors';
import type { SocketStatus } from '../../../shared/realtime';
import type { CurrentUser } from '../../auth/api/getCurrentUser';
import { ACCOUNT_BLOCKED_CODES } from '../../auth/hooks/useLogout';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { clearSession } from '../../auth/session';
import type { ChatMessage, ChatRoom } from '../api/chat';
import { addMessage, type ChatHistoryData, flattenMessages } from '../chatCache';
import { buildChatItems, type OutgoingMessage, type SendFailure } from '../chatItems';
import { eventKeys } from '../../events/hooks/useEvents';
import { chatKeys } from './useChat';
import type { ChatSocketHandlers, SentChatMessage } from './useChatSocket';

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

/**
 * Haptics are a bonus: missing on the web and on some devices, where they reject or throw. They
 * never get in the way of the message.
 */
async function haptic(play: () => Promise<void>) {
  try {
    await play();
  } catch {
    // No haptics on this platform (sync throw or rejection): never break a send.
  }
}

/** What the core needs from the live channel of a conversation, whatever carries it. */
export interface LiveTransport {
  status: SocketStatus;
  /**
   * Sends a message and resolves with the server's ack; it only rejects with an `AppError`. A
   * retry passes the SAME `clientMessageId`, so the server does not store it twice.
   */
  sendMessage: (text: string, clientMessageId: string) => Promise<SentChatMessage>;
  reconnect: () => void;
}

/**
 * The live channel of a conversation: a hook that listens (calling `handlers` for what arrives)
 * and returns how to send. A new `joinAttempt` leaves and joins again. `target` is whatever the
 * transport listens to (`chat:event:<id>` for an event's room; the conversation id for a private
 * channel). It must be a stable function (a module-level hook), because the core calls it on every
 * render.
 */
export type UseLiveTransport = (
  handlers: ChatSocketHandlers,
  joinAttempt: number,
  target: string,
) => LiveTransport;

/** What a conversation needs from its consumer: where its data comes from and where it lives. */
export interface LiveConversationSource {
  /**
   * The room of the conversation, opened (an event's PUT...). A conversation without one (the
   * direct chat) leaves it out: its history is not gated by it and its messages carry
   * `transportTarget` as room id.
   */
  room?: Pick<
    UseQueryResult<ChatRoom, AppError>,
    'data' | 'error' | 'isPending' | 'isSuccess' | 'refetch'
  >;
  /** Its history, newest first; it waits for the room to be open. */
  history: UseInfiniteQueryResult<ChatHistoryData, AppError>;
  /** The key of `history` in the cache: what arrives live is added to it. */
  historyKey: QueryKey;
  /** The live channel: `useChatSocket` for an event's room, a private channel for a direct chat. */
  useTransport: UseLiveTransport;
  /** What `useTransport` listens to (e.g. `chat:event:<id>`, a conversation id). */
  transportTarget: string;
}

/**
 * A conversation, live (TG-469, TG-65): its history, the live room and what the person sends. A
 * message is pending until the server confirms it; a refused one stays `failed` with its reason,
 * and one that may have been stored stays `uncertain`. Both are retried with the same
 * `clientMessageId`, so the server does not store them twice; a failed one can also be
 * discarded. Sending never rejects: the bubble is where the outcome lives. It waits to know who
 * is signed in, so a message of mine is always mine. Where the data comes from is up to the
 * consumer (an event's room, a direct conversation).
 */
export function useLiveConversation({
  room,
  history,
  historyKey,
  useTransport,
  transportTarget,
}: LiveConversationSource) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const me = currentUser.data;
  const [pending, setPending] = useState<OutgoingMessage[]>([]);
  // Joining the live room was refused: without it nothing arrives, so the room shows the error.
  const [socketError, setSocketError] = useState<AppError | null>(null);
  const [revoked, setRevoked] = useState(false);
  // Each new attempt leaves the live room and joins it again (useChatSocket).
  const [joinAttempt, setJoinAttempt] = useState(0);
  // A NOT_SUBSCRIBED send joins again by itself once, until a message goes through.
  const rejoinedBySend = useRef(false);

  const rejoin = useCallback(() => setJoinAttempt((attempt) => attempt + 1), []);

  // The history is caught up on every time the server acknowledges the join, the first one too:
  // that is when its subscription is active (ADR-0030), and what was published before it (while
  // the history was on its way, or while this client was out of the room) never arrives by the
  // socket. Asked for any earlier, the history could miss a message published in between. A
  // request on its way may have read the history before this join, so it is cancelled and starts
  // again (nothing is lost: it was not answered yet; a plain refetch would keep the first load
  // that is still on its way); one already answered is asked for once more. There is one per
  // join, so a connection that flaps makes no storm. A refetch keeps the loaded pages (TanStack
  // asks for each one again from the newest, so the list does not jump). What arrived live is in
  // the history by id.
  const { refetch: refetchHistory } = history;
  const roomOpen = room ? room.isSuccess : true;
  const onJoined = useCallback(() => {
    // Before the room is open there is no history yet: its first page comes after this join.
    if (!roomOpen) return;
    void queryClient.cancelQueries({ queryKey: historyKey }).then(() => refetchHistory());
  }, [historyKey, queryClient, refetchHistory, roomOpen]);

  // What arrives live (a message or the ack of an own one) is kept here too: a request of the
  // history may have read it before that message, and its answer replaces the cache, so it would
  // be lost. The room shows the history merged with what is kept (addMessage does not duplicate
  // by id and keeps the order), so no render lacks a message that already arrived and its key
  // does not change: it is not shown as new a second time.
  const [arrived, setArrived] = useState<ChatMessage[]>([]);
  const addLive = useCallback(
    (message: ChatMessage) => {
      queryClient.setQueryData<ChatHistoryData>(historyKey, (cached) =>
        addMessage(cached, message),
      );
      setArrived((current) =>
        current.some((kept) => kept.id === message.id) ? current : [...current, message],
      );
    },
    [historyKey, queryClient],
  );
  const merged = useMemo(
    () =>
      arrived.reduce<ChatHistoryData | undefined>(
        (data, message) => addMessage(data, message),
        history.data,
      ),
    [arrived, history.data],
  );
  // What the history already has leaves what is kept, with nothing to see. Not while a request is
  // on its way: it may be one that read the history before the message. It is done while
  // rendering (React: «storing information from previous renders»), not in an effect, so there is
  // no render in between.
  const isFetchingHistory = history.isFetching;
  const [prunedAt, setPrunedAt] = useState<{ data: unknown; fetching: boolean }>();
  if (
    history.data &&
    (prunedAt?.data !== history.data || prunedAt.fetching !== isFetchingHistory)
  ) {
    setPrunedAt({ data: history.data, fetching: isFetchingHistory });
    if (!isFetchingHistory) {
      const stored = new Set(flattenMessages(history.data).map((message) => message.id));
      const remaining = arrived.filter((message) => !stored.has(message.id));
      if (remaining.length !== arrived.length) setArrived(remaining);
    }
  }

  const takeOut = useCallback(() => {
    setRevoked(true);
    void queryClient.invalidateQueries({ queryKey: chatKeys.rooms });
    void queryClient.invalidateQueries({ queryKey: eventKeys.subscriptions() });
  }, [queryClient]);

  const socket = useTransport(
    {
      onMessage: addLive,
      onRevoked: takeOut,
      onError: (error) => {
        if (error.code === FORBIDDEN) takeOut();
        else setSocketError(error);
      },
      onJoined,
    },
    joinAttempt,
    transportTarget,
  );

  const roomId = room?.data?.id ?? transportTarget;
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
      void haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      if (error.code === NOT_SUBSCRIBED) {
        // Retrying works once the room is joined again: join it now, once.
        mark(clientMessageId, 'failed', { code: error.code, retryable: true });
        if (!rejoinedBySend.current) {
          rejoinedBySend.current = true;
          rejoin();
        }
        return;
      }
      mark(clientMessageId, 'failed', { code: error.code, retryable: error.retryable });
      if (error.code === FORBIDDEN) takeOut();
      if (ACCOUNT_BLOCKED_CODES.includes(error.code)) {
        // The account was suspended or deleted: end the session, then tell why at /login.
        void clearSession(queryClient).then(() =>
          router.replace({ pathname: '/login', params: { notice: error.code } }),
        );
      }
    },
    [mark, queryClient, rejoin, router, takeOut],
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
        room_id: roomId,
        author: { id: author.id, name: author.display_name },
        text,
        sent_at: ack.sent_at,
      };
      addLive(message);
      setPending((current) =>
        current.filter((outgoing) => outgoing.clientMessageId !== clientMessageId),
      );
      void haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    },
    [addLive, refused, roomId, sendMessage],
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
    if (room) void room.refetch().then(() => history.refetch());
    else void history.refetch();
  }, [currentUser, history, rejoin, room, socketError]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loadOlder = useCallback(() => {
    // Also without a re-render in between (two scroll ends in a row), a page on its way is kept,
    // not cancelled and asked for again.
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const myUserId = me?.id ?? '';
  const items = useMemo(
    () => buildChatItems({ messages: flattenMessages(merged), myUserId, pending }),
    [merged, myUserId, pending],
  );

  // A failed older page or a failed refetch keeps the history on screen: only what stops the
  // room from opening is an error of the room.
  const error =
    (me ? null : currentUser.error) ??
    (room && !room.data ? room.error : null) ??
    (history.data ? null : history.error) ??
    socketError;

  return {
    items,
    isLoading: !error && (currentUser.isPending || room?.isPending || history.isPending),
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
