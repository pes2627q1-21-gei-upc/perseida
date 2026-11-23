import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type AppError } from '../../../shared/errors';
import { type ServerFrame, useSocket } from '../../../shared/realtime';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { socketAuth } from '../../auth/socketAuth';
import type { ChatMessage } from '../../chat/api/chat';
import { buildChatItems, type OutgoingMessage } from '../../chat/chatItems';
import { directChatKeys, useDirectMessages, useMarkRead } from './useDirectChat';

type DirectEvent = {
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
  const { status: socketStatus, subscribePrivate, send: sendFrame, reconnect } = socket;
  const { refetch: refetchHistory } = history;
  const [arrived, setArrived] = useState<DirectEvent[]>([]);
  const [pending, setPending] = useState<ScopedOutgoing[]>([]);
  const markReadRef = useRef(markRead.mutate);
  useEffect(() => {
    markReadRef.current = markRead.mutate;
  });

  useEffect(() => {
    if (!conversationId || socketStatus !== 'open') return;
    // Re-fetch after authentication/reconnection so messages sent while offline are recovered.
    void refetchHistory();
    markReadRef.current(conversationId);
    return subscribePrivate((frame: ServerFrame) => {
      if (frame.type !== 'dm.message') return;
      const message = directEvent(frame.payload);
      if (!message || message.conversation_id !== conversationId) return;
      setArrived((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message],
      );
      void queryClient.invalidateQueries({ queryKey: directChatKeys.conversations });
      markReadRef.current(conversationId);
    });
  }, [conversationId, socketStatus, subscribePrivate, queryClient, refetchHistory]);

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
