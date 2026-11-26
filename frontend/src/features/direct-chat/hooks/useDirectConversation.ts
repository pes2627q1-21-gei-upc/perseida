import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSocket } from '../../../shared/realtime';
import { socketAuth } from '../../auth/socketAuth';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { useLiveConversation } from '../../chat/hooks/useLiveConversation';
import type { DirectMessage } from '../api/directChat';
import { directEvent } from '../directMessages';
import { directChatKeys, useDirectMessages, useMarkRead } from './useDirectChat';
import { useDirectTransport } from './useDirectTransport';

/**
 * A private conversation (TG-65): its cursor-based history and its private channel, run by the
 * generic `useLiveConversation` (pending, retry, discard, errors, catching up on connecting).
 * What is specific to a direct chat is here:
 * - the conversation is marked as read only while it is on screen (focused, app in the
 *   foreground) and once its latest history has been read, never from a request that answers
 *   after the person left it;
 * - `lastIncoming` is the last message that arrived live from the other participant (never the
 *   history, an own message or a repeated one), to announce it;
 * - what arrives for any conversation refreshes the inbox, so its unread counts stay current;
 * - `otherName` names the other participant on the history, which the API sends without names.
 * The screen must be keyed by the conversation id, since the core keeps what is pending and what
 * arrived in its own state.
 */
export function useDirectConversation(conversationId: string, otherName?: string) {
  const queryClient = useQueryClient();
  const myUserId = useCurrentUser().data?.id;
  const history = useDirectMessages(conversationId, { meId: myUserId, otherName });
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
  const isFocused = useIsFocused();
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active');
  // Whether the latest history has been read: only then may a new message advance the read mark.
  const historyReady = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') historyReady.current = false;
      setIsForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const { refetch: refetchHistory } = history;
  useEffect(() => {
    historyReady.current = false;
    if (!conversationId || !isFocused || !isForeground) return;
    let cancelled = false;
    // Read the latest history before advancing the read mark.
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
  }, [conversationId, isFocused, isForeground, refetchHistory, status]);

  // What the history already has is not news, and neither is a message seen twice: a replayed
  // outbox event must not be announced if it is already visible.
  const seenMessageIds = useRef(new Set<string>());
  useEffect(() => {
    for (const page of history.data?.pages ?? []) {
      for (const message of page.messages) seenMessageIds.current.add(message.id);
    }
  }, [history.data]);
  // An announcement belongs to the conversation and connection it arrived in.
  const eventScope = useMemo(() => ({ conversationId, status }), [conversationId, status]);
  const [lastIncoming, setLastIncoming] = useState<{ scope: object; message: DirectMessage }>();

  useEffect(() => {
    if (!conversationId || status !== 'open') return;
    return subscribePrivate((frame) => {
      if (frame.type !== 'dm.message') return;
      const message = directEvent(frame.payload);
      if (!message) return;
      void queryClient.invalidateQueries({ queryKey: directChatKeys.conversations });
      if (message.conversation_id !== conversationId) return;
      const alreadySeen = seenMessageIds.current.has(message.id);
      seenMessageIds.current.add(message.id);
      if (!alreadySeen && message.sender_id !== myUserId)
        setLastIncoming({ scope: eventScope, message });
      if (historyReady.current) markReadRef.current(conversationId);
    });
  }, [conversationId, status, subscribePrivate, queryClient, myUserId, eventScope]);

  return {
    ...conversation,
    lastIncoming:
      myUserId && lastIncoming?.scope === eventScope && lastIncoming.message.sender_id !== myUserId
        ? lastIncoming.message
        : undefined,
  };
}
