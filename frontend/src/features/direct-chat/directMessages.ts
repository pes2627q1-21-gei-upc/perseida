import type { ChatHistory, ChatMessage } from '../chat/api/chat';
import type { DirectHistory, DirectMessage } from './api/directChat';

/** A `dm.message` frame's payload, checked: the socket is not typed, so nothing is assumed. */
export function directEvent(value: Record<string, unknown> | undefined): DirectMessage | undefined {
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

/** A direct message as the chat core reads it: the conversation is its room. */
export function asChatMessage(message: DirectMessage, name: string | null = null): ChatMessage {
  return {
    id: message.id,
    room_id: message.conversation_id,
    author: { id: message.sender_id, name },
    text: message.text,
    sent_at: message.sent_at,
  };
}

/** A page of the direct history as the chat core reads it. */
export function asChatHistory(page: DirectHistory): ChatHistory {
  return {
    messages: page.messages.map((message) => asChatMessage(message)),
    next_cursor: page.next_cursor,
  };
}
