import type { ConversationView } from './types';

/** The letter of the avatar of someone with no picture: the first character, in capitals. */
export function initialOf(name: string): string {
  const [first] = Array.from(name.trim());
  return first ? first.toLocaleUpperCase() : '?';
}

export type PreviewKind = 'none' | 'mine' | 'theirs';

/** Who wrote the last message of a conversation, or none if it is still empty. */
export function previewKind(lastMessage: ConversationView['lastMessage']): PreviewKind {
  if (!lastMessage) return 'none';
  return lastMessage.fromMe ? 'mine' : 'theirs';
}

/** The translate function of i18next, as far as these helpers need it. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The line of the last message: its text («Tu: …» if mine), or «no messages yet». */
export function previewText(t: Translate, lastMessage: ConversationView['lastMessage']): string {
  if (!lastMessage) return t('directChat.noMessages');
  return previewKind(lastMessage) === 'mine'
    ? t('directChat.you', { text: lastMessage.preview })
    : lastMessage.preview;
}

/**
 * What a screen reader says of the row, in the order of importance: who, how many unread, if it
 * is blocked, the last message and when it was sent. The count is the real one, never «99+».
 */
export function conversationLabel(
  t: Translate,
  { otherUser, lastMessage, unreadCount, blockedByMe }: ConversationView,
  time: string | undefined,
): string {
  const preview = previewText(t, lastMessage);
  return [
    t('directChat.conversationWith', { name: otherUser.displayName }),
    unreadCount > 0 ? t('directChat.unread', { count: unreadCount }) : undefined,
    blockedByMe ? t('directChat.blocked') : undefined,
    lastMessage ? t('directChat.lastMessage', { text: preview }) : preview,
    time,
  ]
    .filter(Boolean)
    .join(', ');
}
