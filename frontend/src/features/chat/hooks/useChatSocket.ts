import { useCallback, useEffect, useRef } from 'react';

import type { components } from '../../../shared/api/schema';
import { useSocket } from '../../../shared/realtime';
import { socketAuth } from '../../auth/socketAuth';

export type ChatMessage = components['schemas']['ChatMessageResponse'];
/** What the server's ack of a sent message carries (ADR-0030, TG-64). */
export type SentChatMessage = Pick<ChatMessage, 'id' | 'sent_at'>;

export interface ChatSocketHandlers {
  /** A message from another user of the room (the server does not echo the sender's own). */
  onMessage: (message: ChatMessage) => void;
  /** The server took the user out of the room (e.g. they left the event). */
  onRevoked: () => void;
}

/** Live chat of an event over the shared WebSocket: room `chat:event:<eventId>`. */
export function useChatSocket(eventId: string, handlers: ChatSocketHandlers) {
  const { status, error, subscribe, send, reconnect } = useSocket(socketAuth);
  const room = `chat:event:${eventId}`;

  // The latest handlers, without leaving and joining the room again on every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(
    () =>
      subscribe(room, (frame) => {
        if (frame.id) return; // Answers to this client's own requests.
        if (frame.type === 'message') handlersRef.current.onMessage(frame.payload as ChatMessage);
        else if (frame.type === 'unsubscribe') handlersRef.current.onRevoked();
      }),
    [room, subscribe],
  );

  const sendMessage = useCallback(
    async (text: string): Promise<SentChatMessage> => {
      const ack = await send({ type: 'message', room, payload: { text } });
      const { id, sent_at } = ack.payload as SentChatMessage;
      return { id, sent_at };
    },
    [room, send],
  );

  return { status, error, sendMessage, reconnect };
}
