import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type ServerFrame, useSocket } from '../../../shared/realtime';
import { socketAuth } from '../../auth/socketAuth';

const TYPING_TIMEOUT_MS = 5000;
const TYPING_REFRESH_MS = 4000;

/** Typing is private, transient and scoped to the conversation on screen. */
export function useDirectTyping(conversationId: string) {
  const { subscribePrivate, sendEphemeral, status } = useSocket(socketAuth);
  const subscribeRef = useRef(subscribePrivate);
  useEffect(() => {
    subscribeRef.current = subscribePrivate;
  });
  // A new scope is made on every transition, even A → B → A or open → reconnecting → open.
  // An old indication never belongs to the new subscription.
  const scope = useMemo(() => ({ conversationId, status }), [conversationId, status]);
  const [typingScope, setTypingScope] = useState<object | null>(null);

  useEffect(() => {
    if (status !== 'open') return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const handle = (frame: ServerFrame) => {
      if (
        frame.type !== 'dm.typing' ||
        frame.payload?.conversation_id !== conversationId ||
        typeof frame.payload.is_typing !== 'boolean'
      )
        return;
      clearTimeout(timeout);
      if (!frame.payload.is_typing) {
        setTypingScope(null);
        return;
      }
      setTypingScope(scope);
      timeout = setTimeout(() => setTypingScope(null), TYPING_TIMEOUT_MS);
    };
    const unsubscribe = subscribeRef.current(handle);
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [conversationId, status, scope]);

  const lastSent = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      clearTimeout(idleTimer.current);
      if (!conversationId || status !== 'open') return;
      if (!isTyping) {
        if (lastSent.current !== null) {
          sendEphemeral({
            type: 'dm.typing',
            payload: { conversation_id: conversationId, is_typing: false },
          });
          lastSent.current = null;
        }
        return;
      }
      const now = Date.now();
      if (lastSent.current === null || now - lastSent.current >= TYPING_REFRESH_MS) {
        sendEphemeral({
          type: 'dm.typing',
          payload: { conversation_id: conversationId, is_typing: true },
        });
        lastSent.current = now;
      }
      idleTimer.current = setTimeout(() => {
        sendEphemeral({
          type: 'dm.typing',
          payload: { conversation_id: conversationId, is_typing: false },
        });
        lastSent.current = null;
      }, TYPING_TIMEOUT_MS);
    },
    [conversationId, sendEphemeral, status],
  );

  useEffect(
    () => () => {
      clearTimeout(idleTimer.current);
      if (lastSent.current !== null && status === 'open') {
        sendEphemeral({
          type: 'dm.typing',
          payload: { conversation_id: conversationId, is_typing: false },
        });
      }
      lastSent.current = null;
    },
    [conversationId, sendEphemeral, status],
  );

  return { isTyping: status === 'open' && typingScope === scope, setTyping };
}
