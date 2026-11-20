import { LAIA_ID, makeMessage, PAU, PAU_ID } from '../../../__mocks__/chat';
import type { ChatMessage } from './api/chat';
import { buildChatItems, type OutgoingMessage } from './chatItems';

const ME = LAIA_ID;

/** `n` makes the id; messages are written newest first, as the history comes. */
function msg(n: number, sentAt: string, overrides: Record<string, unknown> = {}) {
  return makeMessage(n, { sent_at: sentAt, ...overrides }) as ChatMessage;
}
const byPau = { author: PAU };

function build(
  messages: ChatMessage[],
  options: { pending?: OutgoingMessage[]; timeZone?: string; myUserId?: string } = {},
) {
  return buildChatItems({
    messages,
    myUserId: options.myUserId ?? ME,
    pending: options.pending ?? [],
    timeZone: options.timeZone ?? 'UTC',
  });
}

/** One entry per item, to read the order: message `m:n`, pending `p:<id>`, day `D`. */
function shape(items: ReturnType<typeof build>) {
  return items.map((item) => {
    if (item.kind === 'day') return 'D';
    if (item.kind === 'pending') return `p:${item.clientMessageId}`;
    return `m:${item.message.text.replace('Missatge ', '')}`;
  });
}

describe('buildChatItems (TG-469)', () => {
  it('has nothing to show without messages and without pending ones', () => {
    expect(build([])).toEqual([]);
  });

  it('turns a message into an item with its key, and says whether it is mine', () => {
    const mine = msg(2, '2026-11-17T10:00:00Z');
    const theirs = msg(1, '2026-11-17T09:00:00Z', byPau);

    const items = build([mine, theirs]);

    expect(items[0]).toMatchObject({ kind: 'message', key: mine.id, message: mine, mine: true });
    expect(items[1]).toMatchObject({
      kind: 'message',
      key: theirs.id,
      message: theirs,
      mine: false,
    });
  });

  it('puts the pending messages first, the newest end, in the order given', () => {
    const sent = msg(1, '2026-11-17T09:00:00Z');
    const pending: OutgoingMessage[] = [
      { clientMessageId: 'c2', text: 'Segon', status: 'sending' },
      { clientMessageId: 'c1', text: 'Primer', status: 'failed' },
    ];

    const items = build([sent], { pending });

    expect(shape(items)).toEqual(['p:c2', 'p:c1', 'm:1', 'D']);
    expect(items[0]).toEqual({
      kind: 'pending',
      key: 'c2',
      clientMessageId: 'c2',
      text: 'Segon',
      status: 'sending',
    });
    expect(items[1]).toMatchObject({ kind: 'pending', status: 'failed' });
  });

  it('shows pending messages even when the history is empty, with no day separator', () => {
    const pending: OutgoingMessage[] = [
      { clientMessageId: 'c1', text: 'Hola', status: 'uncertain' },
    ];

    expect(shape(build([], { pending }))).toEqual(['p:c1']);
  });

  describe('day separators', () => {
    it('go after the oldest message of each day, so they are drawn above that day (inverted list)', () => {
      const items = build([
        msg(4, '2026-11-18T10:00:00Z'),
        msg(3, '2026-11-17T22:00:00Z'),
        msg(2, '2026-11-17T09:00:00Z'),
        msg(1, '2026-11-16T12:00:00Z'),
      ]);

      expect(shape(items)).toEqual(['m:4', 'D', 'm:3', 'm:2', 'D', 'm:1', 'D']);
    });

    it('carry the instant of the first message of the day', () => {
      const items = build([msg(3, '2026-11-17T22:00:00Z'), msg(2, '2026-11-17T09:00:00Z')]);

      const day = items.find((item) => item.kind === 'day');
      expect(day).toMatchObject({ kind: 'day', date: '2026-11-17T09:00:00Z' });
    });

    it('follow the day of the time zone, not the UTC one', () => {
      const late = msg(2, '2026-11-17T23:30:00Z');
      const early = msg(1, '2026-11-17T22:30:00Z');

      // Madrid is UTC+1 in November: 23:30 UTC is already the 18th there.
      expect(shape(build([late, early], { timeZone: 'Europe/Madrid' }))).toEqual([
        'm:2',
        'D',
        'm:1',
        'D',
      ]);
      expect(shape(build([late, early], { timeZone: 'UTC' }))).toEqual(['m:2', 'm:1', 'D']);
    });

    it('keep their key when newer messages arrive the same day', () => {
      const old = msg(1, '2026-11-17T09:00:00Z');
      const before = build([old]).find((item) => item.kind === 'day');

      const after = build([msg(2, '2026-11-17T11:00:00Z'), old]).find(
        (item) => item.kind === 'day',
      );

      expect(before?.key).toBeDefined();
      expect(after?.key).toBe(before?.key);
    });
  });

  describe('author shown (showAuthor)', () => {
    const shown = (items: ReturnType<typeof build>) =>
      items.flatMap((item) => (item.kind === 'message' ? [item.showAuthor] : []));

    it('only on the oldest message of a run of the same person, which is drawn on top', () => {
      const items = build([
        msg(3, '2026-11-17T10:03:00Z', byPau),
        msg(2, '2026-11-17T10:02:00Z', byPau),
        msg(1, '2026-11-17T10:01:00Z', byPau),
      ]);

      expect(shown(items)).toEqual([false, false, true]);
    });

    it('starts again when someone else speaks in between', () => {
      // Chronological: Pau, Laia, Pau, Pau.
      const items = build([
        msg(4, '2026-11-17T10:04:00Z', byPau),
        msg(3, '2026-11-17T10:03:00Z', byPau),
        msg(2, '2026-11-17T10:02:00Z'),
        msg(1, '2026-11-17T10:01:00Z', byPau),
      ]);

      expect(shown(items)).toEqual([false, true, false, true]);
    });

    it('is never true for my own messages', () => {
      const items = build([msg(2, '2026-11-17T10:02:00Z'), msg(1, '2026-11-17T10:01:00Z')]);

      expect(shown(items)).toEqual([false, false]);
    });

    it('starts again on a new day, even for the same person', () => {
      const items = build([
        msg(2, '2026-11-18T09:00:00Z', byPau),
        msg(1, '2026-11-17T22:00:00Z', byPau),
      ]);

      expect(shown(items)).toEqual([true, true]);
    });

    it('tells people apart by id, even when the name is missing', () => {
      const other = { id: '01a1bd9a-0000-7000-8000-0000000000cc', name: null };
      const items = build([
        msg(2, '2026-11-17T10:02:00Z', { author: { id: PAU_ID, name: null } }),
        msg(1, '2026-11-17T10:01:00Z', { author: other }),
      ]);

      expect(shown(items)).toEqual([true, true]);
    });
  });

  it('gives every item a different key, also across kinds', () => {
    const items = build(
      [
        msg(3, '2026-11-18T10:00:00Z'),
        msg(2, '2026-11-17T10:00:00Z'),
        msg(1, '2026-11-17T09:00:00Z'),
      ],
      { pending: [{ clientMessageId: 'c1', text: 'Hola', status: 'sending' }] },
    );

    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not change its input', () => {
    const messages = [msg(2, '2026-11-17T10:00:00Z'), msg(1, '2026-11-16T10:00:00Z')];
    const pending: OutgoingMessage[] = [{ clientMessageId: 'c1', text: 'Hola', status: 'sending' }];
    const snapshot = JSON.stringify({ messages, pending });

    build(messages, { pending });

    expect(JSON.stringify({ messages, pending })).toBe(snapshot);
  });
});

describe('buildChatItems: a refused message keeps why (TG-469)', () => {
  it('passes the error of a pending message on to its item', () => {
    const [item] = buildChatItems({
      messages: [],
      myUserId: 'me',
      pending: [
        {
          clientMessageId: 'client-1',
          text: 'Hola',
          status: 'failed',
          error: { code: 'RATE_LIMITED', retryable: true },
        },
      ],
    });

    expect(item).toMatchObject({
      kind: 'pending',
      status: 'failed',
      error: { code: 'RATE_LIMITED', retryable: true },
    });
  });

});

describe('buildChatItems: day separators of messages out of order (TG-469)', () => {
  it('gives every day separator its own key even when the messages come out of order', () => {
    // Out of sent_at order: the 17th, then the 18th, then the 17th again.
    const items = build([
      msg(3, '2026-11-17T12:00:00Z'),
      msg(2, '2026-11-18T10:00:00Z'),
      msg(1, '2026-11-17T09:00:00Z'),
    ]);

    const dayKeys = items.filter((item) => item.kind === 'day').map((item) => item.key);
    expect(dayKeys).toHaveLength(3);
    expect(new Set(dayKeys).size).toBe(3);
    // The key of a day that only appears once stays the same as before.
    expect(dayKeys).toContain('day-2026-11-18');
  });
});
