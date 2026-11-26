/**
 * A 1-to-1 conversation as the list shows it (TG-65). The data layer adapts what the API
 * returns to this view; the presentational pieces know nothing else.
 */
export interface ConversationView {
  id: string;
  otherUser: { id: string; displayName: string; avatarUrl?: string };
  lastMessage?: {
    /** The text of the last message, uncut: the row cuts it to one line. */
    preview: string;
    /** ISO 8601 instant. */
    sentAt: string;
    /** The last message is mine. */
    fromMe: boolean;
  };
  unreadCount: number;
  /** I have blocked the other user. */
  blockedByMe: boolean;
}
