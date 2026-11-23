import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type AppError } from '../../../shared/errors';
import { type ServerFrame, useSocket } from '../../../shared/realtime';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { socketAuth } from '../../auth/socketAuth';
import type { ChatMessage } from '../../chat/api/chat';
import { buildChatItems, type OutgoingMessage } from '../../chat/chatItems';
import { directChatKeys, useDirectMessages, useMarkRead } from './useDirectChat';

export type DirectEvent = {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  sent_at: string;
};
type ScopedOutgoing = OutgoingMessage & { conversationId: string };

function directEvent(value: Record<string, unknown> | undefined): DirectEvent | undefined {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.conversation_id !== 'string' ||
    typeof value.sender_id !== 'string' ||
    typeof value.text !== 'string' ||
    typeof value.sent_at !== 'string'
  )
    return undefined;
  return {
    id: value.id,
    conversation_id: value.conversation_id,
    sender_id: value.sender_id,
    text: value.text,
    sent_at: value.sent_at,
  };
}

function asChatMessage(message: DirectEvent, name: string | null): ChatMessage {
  return {
    id: message.id,
    room_id: message.conversation_id,
    author: { id: message.sender_id, name },
    text: message.text,
    sent_at: message.sent_at,
  };
}

/** A private conversation over the authenticated socket and cursor-based history. */
export function useDirectConversation(conversationId: string) {
  const queryClient = useQueryClient();
  const history = useDirectMessages(conversationId);
  const user = useCurrentUser();
  const markRead = useMarkRead();
  const socket = useSocket(socketAuth);
  const isFocused = useIsFocused();
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active');
  const historyReady = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') historyReady.current = false;
      setIsForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  const { status: socketStatus, subscribePrivate, send: sendFrame, reconnect } = socket;
  const { refetch: refetchHistory } = history;
  const [arrived, setArrived] = useState<DirectEvent[]>([]);
  const [pending, setPending] = useState<ScopedOutgoing[]>([]);
  const eventScope = useMemo(
    () => ({ conversationId, socketStatus }),
    [conversationId, socketStatus],
  );
  const [lastIncoming, setLastIncoming] = useState<{ scope: object; message: DirectEvent }>();
  const seenMessageIds = useRef(new Set<string>());
  const myUserId = user.data?.id;

  // Seed the deduplication set from history as well as live frames. A replayed
  // outbox event must not be announced if it is already visible in history.
  useEffect(() => {
    for (const page of history.data?.pages ?? []) {
      for (const message of page.messages) seenMessageIds.current.add(message.id);
    }
  }, [history.data]);
  const markReadRef = useRef(markRead.mutate);
  useEffect(() => {
    markReadRef.current = markRead.mutate;
  });

  useEffect(() => {
    historyReady.current = false;
    if (!conversationId || !isFocused || !isForeground) return;
    let cancelled = false;
    // Read the latest history before advancing the read mark; Redis is not needed here.
    void refetchHistory()
      .then((result) => {
        if (cancelled || result.isError || !result.data) return;
        historyReady.current = true;
        markReadRef.current(conversationId);
      })
      .catch(() => {
        // The query exposes its error and leaves unread messages intact.
      });
    return () => {
      cancelled = true;
      historyReady.current = false;
    };
  }, [conversationId, isFocused, isForeground, refetchHistory, socketStatus]);

  useEffect(() => {
    if (!conversationId || socketStatus !== 'open') return;
    return subscribePrivate((frame: ServerFrame) => {
      if (frame.type !== 'dm.message') return;
      const message = directEvent(frame.payload);
      if (!message) return;
      void queryClient.invalidateQueries({ queryKey: directChatKeys.conversations });
      if (message.conversation_id !== conversationId) return;
      const alreadySeen = seenMessageIds.current.has(message.id);
      seenMessageIds.current.add(message.id);
      if (!alreadySeen && message.sender_id !== myUserId)
        setLastIncoming({ scope: eventScope, message });
      setArrived((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message],
      );
      if (historyReady.current) markReadRef.current(conversationId);
    });
  }, [conversationId, socketStatus, subscribePrivate, queryClient, myUserId, eventScope]);

  const updatePending = useCallback(
    (id: string, status: OutgoingMessage['status'], error?: OutgoingMessage['error']) => {
      setPending((current) =>
        current.map((item) => (item.clientMessageId === id ? { ...item, status, error } : item)),
      );
    },
    [],
  );

  const deliver = useCallback(
    async (text: string, clientMessageId: string) => {
      try {
        const ack = await sendFrame({
          type: 'dm.send',
          payload: { conversation_id: conversationId, text, client_message_id: clientMessageId },
        });
        if (
          typeof ack.payload?.id !== 'string' ||
          typeof ack.payload.sent_at !== 'string' ||
          !user.data
        )
          throw new Error('Invalid direct-message acknowledgement');
        const message: DirectEvent = {
          id: ack.payload.id,
          sent_at: ack.payload.sent_at,
          conversation_id: conversationId,
          sender_id: user.data.id,
          text,
        };
        seenMessageIds.current.add(message.id);
        setArrived((current) =>
          current.some((item) => item.id === message.id) ? current : [...current, message],
        );
        setPending((current) => current.filter((item) => item.clientMessageId !== clientMessageId));
        void queryClient.invalidateQueries({ queryKey: directChatKeys.conversations });
      } catch (caught) {
        const error = caught as AppError;
        const failed =
          error.code === 'NETWORK_ERROR' || (error.status !== undefined && error.status < 500);
        updatePending(
          clientMessageId,
          failed ? 'failed' : 'uncertain',
          failed ? { code: error.code, retryable: error.retryable } : undefined,
        );
      }
    },
    [conversationId, queryClient, sendFrame, updatePending, user.data],
  );

  const send = useCallback(
    async (text: string) => {
      if (!user.data) return;
      const clientMessageId = Crypto.randomUUID();
      setPending((current) => [
        { clientMessageId, conversationId, text, status: 'sending' },
        ...current,
      ]);
      void deliver(text, clientMessageId);
    },
    [conversationId, deliver, user.data],
  );

  const retry = useCallback(
    async (id: string) => {
      const outgoing = pending.find(
        (item) => item.clientMessageId === id && item.conversationId === conversationId,
      );
      if (!outgoing || !user.data) return;
      updatePending(id, 'sending');
      await deliver(outgoing.text, id);
    },
    [conversationId, deliver, pending, updatePending, user.data],
  );

  const discard = useCallback(
    (id: string) => setPending((current) => current.filter((item) => item.clientMessageId !== id)),
    [],
  );
  const items = useMemo(() => {
    const messages = [
      ...arrived.filter((item) => item.conversation_id === conversationId),
      ...(history.data?.pages.flatMap((page) => page.messages) ?? []),
    ];
    const unique = [...new Map(messages.map((message) => [message.id, message])).values()];
    unique.sort((a, b) => b.sent_at.localeCompare(a.sent_at) || b.id.localeCompare(a.id));
    return buildChatItems({
      messages: unique.map((message) =>
        asChatMessage(message, message.sender_id === user.data?.id ? user.data.display_name : null),
      ),
      myUserId: user.data?.id ?? '',
      pending: pending.filter((item) => item.conversationId === conversationId),
    });
  }, [arrived, conversationId, history.data, pending, user.data]);

  return {
    items,
    lastIncoming:
      myUserId && lastIncoming?.scope === eventScope && lastIncoming.message.sender_id !== myUserId
        ? lastIncoming.message
        : undefined,
    isLoading: user.isPending || history.isPending,
    error: user.error ?? history.error,
    status: socketStatus,
    reconnect,
    send,
    retry,
    discard,
    reload: () => void history.refetch(),
    hasMore: history.hasNextPage,
    isFetchingMore: history.isFetchingNextPage,
    loadOlder: () => {
      if (history.hasNextPage && !history.isFetchingNextPage)
        void history.fetchNextPage({ cancelRefetch: false });
    },
  };
}
