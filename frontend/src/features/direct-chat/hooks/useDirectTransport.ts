import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { AppError } from '../../../shared/errors';
import { type ServerFrame, useSocket } from '../../../shared/realtime';
import { socketAuth } from '../../auth/socketAuth';
import type { SentChatMessage } from '../../chat/hooks/useChatSocket';
import type { UseLiveTransport } from '../../chat/hooks/useLiveConversation';
import type { ConversationOverview } from '../api/directChat';
import { asChatMessage, directEvent } from '../directMessages';
import { directChatKeys } from './useDirectChat';

/** The server's answer to a `dm.send` did not say which message it stored. */
function invalidAck(): AppError {
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', retryable: false });
}

/**
 * The live channel of a direct conversation, for `useLiveConversation`: the user's private
 * channel (the server derives it from the session, so there is no room to join) filtered to
 * `conversationId`, and `dm.send` for what the person writes. Being open is what joining is for
 * a private channel: `onJoined` runs every time the socket becomes open, so the core catches the
 * history up. It is a module-level hook, as the core requires.
 */
export const useDirectTransport: UseLiveTransport = (handlers, joinAttempt, conversationId) => {
  const queryClient = useQueryClient();
  const { status, subscribePrivate, send, reconnect } = useSocket(socketAuth);

  // The latest handlers, without listening again on every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!conversationId || status !== 'open') return;
    const unsubscribe = subscribePrivate((frame: ServerFrame) => {
      if (frame.type !== 'dm.message') return;
      const message = directEvent(frame.payload);
      if (!message || message.conversation_id !== conversationId) return;
      const other = queryClient
        .getQueryData<ConversationOverview[]>(directChatKeys.conversations)
        ?.find((row) => row.conversation_id === conversationId);
      const name =
        other?.other_user_id === message.sender_id ? (other.other_display_name ?? null) : null;
      handlersRef.current.onMessage(asChatMessage(message, name));
      void queryClient.invalidateQueries({ queryKey: directChatKeys.conversations });
    });
    // Listening is active: what was published before is in the history the core asks for now.
    handlersRef.current.onJoined?.();
    return unsubscribe;
    // `joinAttempt` is not read: changing it listens again and catches up again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, status, subscribePrivate, queryClient, joinAttempt]);

  const sendMessage = useCallback(
    async (text: string, clientMessageId: string): Promise<SentChatMessage> => {
      const ack = await send({
        type: 'dm.send',
        payload: { conversation_id: conversationId, text, client_message_id: clientMessageId },
      });
      const { id, sent_at } = ack.payload ?? {};
      if (typeof id !== 'string' || typeof sent_at !== 'string') throw invalidAck();
      void queryClient.invalidateQueries({ queryKey: directChatKeys.conversations });
      return { id, sent_at };
    },
    [conversationId, queryClient, send],
  );

  return { status, sendMessage, reconnect };
};
