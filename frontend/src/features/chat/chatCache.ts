import type { InfiniteData } from '@tanstack/react-query';

import type { ChatHistory, ChatMessage } from './api/chat';

/** The cached history of a room: one page per request, page 0 the newest, newest first. */
export type ChatHistoryData = InfiniteData<ChatHistory, string | undefined>;

function contains(history: ChatHistoryData, id: string): boolean {
  return history.pages.some((page) => page.messages.some((message) => message.id === id));
}

/**
 * The history with a new message at its newest end (TG-469), for a message that arrives by the
 * socket or is confirmed by the server. A message is known by its id: one that is already there
 * leaves the history as it was (the same object, so nothing re-renders). Without a history
 * there is nothing to add to: the first fetch brings the message anyway.
 */
export function addMessage(
  history: ChatHistoryData | undefined,
  message: ChatMessage,
): ChatHistoryData | undefined {
  if (!history || contains(history, message.id)) return history;
  return {
    ...history,
    pages: history.pages.map((page, index) =>
      index === 0 ? { ...page, messages: [message, ...page.messages] } : page,
    ),
  };
}

/**
 * Every message of the history in one list, newest first. A refetch can move the cursor so that
 * two pages share a message: it is kept once, where it first appears.
 */
export function flattenMessages(history: ChatHistoryData | undefined): ChatMessage[] {
  const seen = new Set<string>();
  const messages: ChatMessage[] = [];
  for (const page of history?.pages ?? []) {
    for (const message of page.messages) {
      if (!seen.has(message.id)) {
        seen.add(message.id);
        messages.push(message);
      }
    }
  }
  return messages;
}
