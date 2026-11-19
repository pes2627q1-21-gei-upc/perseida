import type { EventCategory } from '../events/api/getEvents';
import type { ChatRoom } from './api/chat';
import type { SubscribedEvent } from './api/subscriptions';

/** One row of the chat list: a subscribed event and what was said last in its room. */
export interface RoomListEntry {
  eventId: string;
  title: string;
  startsAt: string;
  category: EventCategory;
  /** Absent while the room does not exist yet or nobody has written in it. */
  lastMessage?: { authorName: string | null; text: string; sentAt: string };
}

/** Instants are compared as instants: ISO texts with different offsets do not sort as text. */
const instant = (iso: string) => new Date(iso).getTime();

/** Rooms with messages first, newest message first; then the ones without, soonest event first. */
function compareEntries(a: RoomListEntry, b: RoomListEntry): number {
  if (a.lastMessage && b.lastMessage) {
    return instant(b.lastMessage.sentAt) - instant(a.lastMessage.sentAt);
  }
  if (a.lastMessage) return -1;
  if (b.lastMessage) return 1;
  return instant(a.startsAt) - instant(b.startsAt) || a.eventId.localeCompare(b.eventId);
}

/**
 * Crosses the events the person is subscribed to with the rooms of the chat (TG-469). The
 * subscriptions decide what is listed: a room of an event she is not subscribed to is left
 * out, and a subscribed event without a room yet still has its row.
 */
export function buildRoomList(events: SubscribedEvent[], rooms: ChatRoom[]): RoomListEntry[] {
  const lastByEvent = new Map(rooms.map((room) => [room.event_id, room.last_message]));
  return events
    .map((event): RoomListEntry => {
      const last = lastByEvent.get(event.id);
      return {
        eventId: event.id,
        title: event.title,
        startsAt: event.starts_at,
        category: event.category,
        ...(last && {
          lastMessage: { authorName: last.author.name, text: last.text, sentAt: last.sent_at },
        }),
      };
    })
    .sort(compareEntries);
}
