import type { InfiniteData } from '@tanstack/react-query';

import type { ChatHistory, ChatMessage } from './api/chat';

/** The cached history of a room: one page per request, page 0 the newest, newest first. */
export type ChatHistoryData = InfiniteData<ChatHistory, string | undefined>;

function contains(history: ChatHistoryData, id: string): boolean {
  return history.pages.some((page) => page.messages.some((message) => message.id === id));
}

/** Whether `a` goes before `b` in the history: newer `sent_at` first, then the bigger id. */
function isNewer(a: ChatMessage, b: ChatMessage): boolean {
  const difference = Date.parse(a.sent_at) - Date.parse(b.sent_at);
  return difference !== 0 ? difference > 0 : a.id > b.id;
}

/**
 * The history with a new message on its first page (TG-469), for a message that arrives by the
 * socket or is confirmed by the server. It goes where its `sent_at` puts it (newest first, the
 * bigger id first on a tie), since messages can arrive out of order. A message is known by its id:
 * one that is already there leaves the history as it was (the same object, so nothing
 * re-renders). Without a history there is nothing to add to: the first fetch brings it anyway.
 */
export function addMessage(
  history: ChatHistoryData | undefined,
  message: ChatMessage,
): ChatHistoryData | undefined {
  if (!history || contains(history, message.id)) return history;
  return {
    ...history,
    pages: history.pages.map((page, index) => {
      if (index !== 0) return page;
      const at = page.messages.findIndex((other) => isNewer(message, other));
      const messages = [...page.messages];
      messages.splice(at < 0 ? messages.length : at, 0, message);
      return { ...page, messages };
    }),
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
