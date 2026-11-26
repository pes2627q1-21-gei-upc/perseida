import { useEffect, useRef } from 'react';

import { useLiveConversation } from '../../chat/hooks/useLiveConversation';
import { useSocket } from '../../../shared/realtime';
import { socketAuth } from '../../auth/socketAuth';
import { directEvent } from '../directMessages';
import { directChatKeys, useDirectMessages, useMarkRead } from './useDirectChat';
import { useDirectTransport } from './useDirectTransport';

/**
 * A private conversation (TG-65): its cursor-based history and its private channel, run by the
 * generic `useLiveConversation` (pending, retry, discard, errors, catching up on connecting).
 * What is specific to a direct chat is here: the conversation is marked as read when it opens and
 * whenever a message arrives in it. The screen must be keyed by the conversation id, since the
 * core keeps what is pending and what arrived in its own state.
 */
export function useDirectConversation(conversationId: string) {
  const history = useDirectMessages(conversationId);
  const conversation = useLiveConversation({
    history,
    historyKey: directChatKeys.messages(conversationId),
    useTransport: useDirectTransport,
    transportTarget: conversationId,
  });

  const markRead = useMarkRead();
  const markReadRef = useRef(markRead.mutate);
  useEffect(() => {
    markReadRef.current = markRead.mutate;
  });
  const { status, subscribePrivate } = useSocket(socketAuth);
  useEffect(() => {
    if (!conversationId || status !== 'open') return;
    markReadRef.current(conversationId);
    return subscribePrivate((frame) => {
      if (frame.type !== 'dm.message') return;
      if (directEvent(frame.payload)?.conversation_id === conversationId)
        markReadRef.current(conversationId);
    });
  }, [conversationId, status, subscribePrivate]);

  return conversation;
}
