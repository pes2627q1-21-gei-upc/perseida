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
  /**
   * The server acknowledged joining the room (also after a reconnection or a new attempt): its
   * subscription is active, so from now on nothing published in the room is missed.
   */
  onJoined?: () => void;
}

/** How many message ids per room are remembered to discard the ones delivered twice. */
const SEEN_IDS_LIMIT = 200;

/**
 * Live chat over the shared WebSocket, in a `room` (`chat:event:<eventId>` for an event). A new `joinAttempt` leaves the room and joins it
 * again (e.g. after the server refused to join it: the connection does not retry a refused join
 * by itself).
 */
export function useChatSocket(room: string, handlers: ChatSocketHandlers, joinAttempt = 0) {
  const { status, error, subscribe, send, reconnect } = useSocket(socketAuth);

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
        // Answers to the joins of this room (the answers of sendMessage settle its promise
        // instead): a failed join or a join that is active.
        if (frame.type === 'error') current.onError?.(errorOfFrame(frame));
        else if (frame.type === 'subscribe') current.onJoined?.();
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
    // `joinAttempt` is not read: changing it is what joins the room again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, subscribe, joinAttempt]);

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
