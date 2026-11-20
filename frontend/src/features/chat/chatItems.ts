import type { ChatMessage } from './api/chat';
import { dateTimeFormat } from './dateFormat';

/** Why the server refused a message, as the bubble needs it: its code and whether a retry can work. */
export interface SendFailure {
  code: string;
  retryable: boolean;
}

/**
 * A message the person wrote that the server has not confirmed yet: being sent, refused or lost
 * on the way (`uncertain`: it may have arrived). `clientMessageId` makes a retry idempotent.
 */
export interface OutgoingMessage {
  clientMessageId: string;
  text: string;
  status: 'sending' | 'failed' | 'uncertain';
  /** Why it was refused (`failed`). */
  error?: SendFailure;
}

/** A message of the history. `showAuthor` is true on the first message of a run of a person. */
export interface MessageItem {
  kind: 'message';
  key: string;
  message: ChatMessage;
  mine: boolean;
  showAuthor: boolean;
}

/** A message of mine not confirmed yet, keyed by its `clientMessageId`. */
export interface PendingItem extends OutgoingMessage {
  kind: 'pending';
  key: string;
}

/** The start of a calendar day: `date` is the instant of its first message. */
export interface DayItem {
  kind: 'day';
  key: string;
  date: string;
}

export type ChatListItem = MessageItem | PendingItem | DayItem;

interface BuildInput {
  /** The history, newest first, as the API gives it. */
  messages: ChatMessage[];
  myUserId: string;
  /** My messages not confirmed yet, newest first. */
  pending: OutgoingMessage[];
  /** Only for tests: the days are the ones of the device. */
  timeZone?: string;
}

/** The calendar day of an instant in a time zone, as `YYYY-MM-DD`: stable, so it can be a key. */
function dayOf(instant: string, timeZone: string | undefined): string {
  const parts = dateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * What the room shows, in the order of an inverted list (TG-469): index 0 is drawn at the
 * bottom. My pending messages go first, then the history; a day separator goes after the oldest
 * message of each day, so it is drawn above that day. The author is shown on the oldest message
 * of a run of someone else (drawn on top of the run), and a new day starts a new run.
 */
export function buildChatItems({
  messages,
  myUserId,
  pending,
  timeZone,
}: BuildInput): ChatListItem[] {
  const items: ChatListItem[] = pending.map((outgoing) => ({
    kind: 'pending',
    key: outgoing.clientMessageId,
    clientMessageId: outgoing.clientMessageId,
    text: outgoing.text,
    status: outgoing.status,
    ...(outgoing.error && { error: outgoing.error }),
  }));

  const days = messages.map((message) => dayOf(message.sent_at, timeZone));
  messages.forEach((message, index) => {
    const older = messages[index + 1];
    const day = days[index];
    const lastOfDay = days[index + 1] !== day;
    const mine = message.author.id === myUserId;
    const startsRun = lastOfDay || older?.author.id !== message.author.id;

    items.push({ kind: 'message', key: message.id, message, mine, showAuthor: !mine && startsRun });
    if (lastOfDay) items.push({ kind: 'day', key: `day-${day}`, date: message.sent_at });
  });
  return items;
}

/** Day separators and my confirmed messages (which replace their pending bubble) never float in. */
function floatsIn(item: ChatListItem): boolean {
  return item.kind === 'pending' || (item.kind === 'message' && !item.mine);
}

/**
 * The keys of what arrived while the room was open (TG-469): the new items at the newest end of
 * `items` that `before` did not have. The first list is the history and a list that shares
 * nothing with the previous one is a new history, so neither has arrivals; older pages come at
 * the other end and are not arrivals either. So the first message of an empty room appears at
 * once: an empty list cannot be told apart from one that is still loading.
 */
export function arrivedKeys(items: ChatListItem[], before: ChatListItem[]): Set<string> {
  const known = new Set(before.map((item) => item.key));
  // Pending messages stay at the bottom until they are confirmed, so they do not mark where the
  // history that was already there begins.
  const newest = items.findIndex((item) => item.kind !== 'pending' && known.has(item.key));
  if (newest < 0) return new Set();
  return new Set(
    items
      .slice(0, newest)
      .filter((item) => !known.has(item.key) && floatsIn(item))
      .map((item) => item.key),
  );
}
