import { makeMessage, makeRoom, makeSubscribedEvent } from '../../../__mocks__/chat';
import type { ChatRoom } from './api/chat';
import type { SubscribedEvent } from './roomList';
import { buildRoomList } from './roomList';

// The mocks are plain objects with the shape of the API; the types are the contract.
const event = (n: number, overrides: Record<string, unknown> = {}) =>
  makeSubscribedEvent(n, overrides) as SubscribedEvent;
const room = (eventId: string, lastMessage: unknown = null, id = `room-${eventId}`) =>
  makeRoom({ id, event_id: eventId, last_message: lastMessage }) as ChatRoom;
const message = (n: number, sentAt: string, overrides: Record<string, unknown> = {}) =>
  makeMessage(n, { sent_at: sentAt, ...overrides });

describe('buildRoomList (TG-469)', () => {
  it('returns nothing when there are no subscriptions', () => {
    expect(buildRoomList([], [])).toEqual([]);
  });

  it('crosses each subscribed event with the room of that event', () => {
    const e = event(1, { category: 'launch', starts_at: '2026-12-05T10:00:00Z' });
    const r = room(e.id, message(1, '2026-11-18T09:30:00Z', { text: 'Hola!' }));

    const [entry, ...rest] = buildRoomList([e], [r]);

    expect(rest).toEqual([]);
    expect(entry).toEqual({
      eventId: e.id,
      title: e.title,
      startsAt: '2026-12-05T10:00:00Z',
      category: 'launch',
      lastMessage: { authorName: 'Laia', text: 'Hola!', sentAt: '2026-11-18T09:30:00Z' },
    });
  });

  it('keeps an event whose room does not exist yet, without a last message', () => {
    const e = event(1);

    const [entry] = buildRoomList([e], []);

    expect(entry).toMatchObject({ eventId: e.id, title: e.title });
    expect(entry?.lastMessage).toBeUndefined();
  });

  it('keeps an event whose room has no messages yet, without a last message', () => {
    const e = event(1);

    const [entry] = buildRoomList([e], [room(e.id, null)]);

    expect(entry?.eventId).toBe(e.id);
    expect(entry?.lastMessage).toBeUndefined();
  });

  it('drops the rooms of events the user is not subscribed to', () => {
    const subscribed = event(1);
    const other = event(2);

    const list = buildRoomList(
      [subscribed],
      [room(other.id, message(1, '2026-11-18T09:30:00Z')), room(subscribed.id)],
    );

    expect(list.map((entry) => entry.eventId)).toEqual([subscribed.id]);
  });

  it('keeps a null author name as null', () => {
    const e = event(1);
    const r = room(e.id, message(1, '2026-11-18T09:30:00Z', { author: { id: 'a', name: null } }));

    const [entry] = buildRoomList([e], [r]);

    expect(entry?.lastMessage?.authorName).toBeNull();
  });

  it('sorts by the last message, newest first', () => {
    const [a, b, c] = [event(1), event(2), event(3)] as [
      SubscribedEvent,
      SubscribedEvent,
      SubscribedEvent,
    ];

    const list = buildRoomList(
      [a, b, c],
      [
        room(a.id, message(1, '2026-11-17T10:00:00Z')),
        room(b.id, message(2, '2026-11-19T10:00:00Z')),
        room(c.id, message(3, '2026-11-18T10:00:00Z')),
      ],
    );

    expect(list.map((entry) => entry.eventId)).toEqual([b.id, c.id, a.id]);
  });

  it('compares the instants of the messages, not their text', () => {
    const [a, b] = [event(1), event(2)] as [SubscribedEvent, SubscribedEvent];

    const list = buildRoomList(
      [a, b],
      [
        // Compared as text 12:00+02:00 would be newer; as an instant it is 10:00Z, older than 10:30Z.
        room(a.id, message(1, '2026-11-18T12:00:00+02:00')),
        room(b.id, message(2, '2026-11-18T10:30:00Z')),
      ],
    );

    expect(list.map((entry) => entry.eventId)).toEqual([b.id, a.id]);
  });

  it('puts the rooms without messages after the ones with messages, by event start and then id', () => {
    const withMessage = event(9, { starts_at: '2027-01-01T00:00:00Z' });
    const late = event(1, { starts_at: '2026-12-20T00:00:00Z' });
    const early = event(5, { starts_at: '2026-12-02T00:00:00Z' });
    const tieB = event(3, { starts_at: '2026-12-10T00:00:00Z' });
    const tieA = event(2, { starts_at: '2026-12-10T00:00:00Z' });

    const list = buildRoomList(
      [late, tieB, early, withMessage, tieA],
      [room(withMessage.id, message(1, '2026-11-18T10:00:00Z')), room(early.id)],
    );

    expect(list.map((entry) => entry.eventId)).toEqual([
      withMessage.id,
      early.id,
      tieA.id,
      tieB.id,
      late.id,
    ]);
  });

  it('compares the event starts as instants, not as text', () => {
    const first = event(2, { starts_at: '2026-12-10T12:00:00+02:00' }); // 10:00Z
    const second = event(1, { starts_at: '2026-12-10T10:30:00Z' });

    const list = buildRoomList([second, first], []);

    expect(list.map((entry) => entry.eventId)).toEqual([first.id, second.id]);
  });
});
