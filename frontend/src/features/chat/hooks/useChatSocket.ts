import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef } from 'react';

import type { components } from '../../../shared/api/schema';
import type { AppError } from '../../../shared/errors';
import { errorOfFrame, useSocket } from '../../../shared/realtime';
import { socketAuth } from '../../auth/socketAuth';

export type ChatMessage = components['schemas']['ChatMessageResponse'];
/** What the server's ack of a sent message carries (ADR-0030, TG-64). */
export type SentChatMessage = Pick<ChatMessage, 'id' | 'sent_at'>;

export interface ChatSocketHandlers {
  /** A message from another user of the room (the server does not echo the sender's own). */
  onMessage: (message: ChatMessage) => void;
  /** The server took the user out of the room (e.g. they left the event). */
  onRevoked: () => void;
  /** Joining the room failed (e.g. FORBIDDEN, CHAT_ROOM_NOT_FOUND, RATE_LIMITED). */
  onError?: (error: AppError) => void;
}

/** How many message ids per room are remembered to discard the ones delivered twice. */
const SEEN_IDS_LIMIT = 200;

/** Live chat of an event over the shared WebSocket: room `chat:event:<eventId>`. */
export function useChatSocket(eventId: string, handlers: ChatSocketHandlers) {
  const { status, error, subscribe, send, reconnect } = useSocket(socketAuth);
  const room = `chat:event:${eventId}`;

  // The latest handlers, without leaving and joining the room again on every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    // The ids already delivered in this room (a retried message may be published again).
    const seenIds = new Set<string>();
    return subscribe(room, (frame) => {
      const current = handlersRef.current;
      if (frame.id) {
        // Answers to this client's own requests (the errors of sendMessage reject its promise
        // instead): only a failed join of the room is reported.
        if (frame.type === 'error') current.onError?.(errorOfFrame(frame));
        return;
      }
      if (frame.type === 'message') {
        const message = frame.payload as ChatMessage;
        if (seenIds.has(message.id)) return;
        seenIds.add(message.id);
        if (seenIds.size > SEEN_IDS_LIMIT) {
          const oldest = seenIds.values().next();
          if (!oldest.done) seenIds.delete(oldest.value);
        }
        current.onMessage(message);
      } else if (frame.type === 'unsubscribe') current.onRevoked();
    });
  }, [room, subscribe]);

  /**
   * Sends a message and resolves with the server's ack. After a SEND_UNCERTAIN the server may have
   * stored it: the UI's manual retry must pass the SAME `clientMessageId` so the server does not
   * duplicate the message.
   */
  const sendMessage = useCallback(
    async (text: string, clientMessageId = Crypto.randomUUID()): Promise<SentChatMessage> => {
      const ack = await send({
        type: 'message',
        room,
        payload: { text, client_message_id: clientMessageId },
      });
      const { id, sent_at } = ack.payload as SentChatMessage;
      return { id, sent_at };
    },
    [room, send],
  );

  return { status, error, sendMessage, reconnect };
}
