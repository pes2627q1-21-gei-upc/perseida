import { makeHistoryData, makeMessage } from '../../../__mocks__/chat';
import type { ChatHistory, ChatMessage } from './api/chat';
import { addMessage, flattenMessages } from './chatCache';

type History = { pages: ChatHistory[]; pageParams: (string | undefined)[] };

// Newest first: page 0 holds the newest messages, as the API returns them.
const m5 = makeMessage(5) as ChatMessage;
const m4 = makeMessage(4) as ChatMessage;
const m3 = makeMessage(3) as ChatMessage;
const m2 = makeMessage(2) as ChatMessage;
const m1 = makeMessage(1) as ChatMessage;

function history(): History {
  return makeHistoryData([
    [m4, m3],
    [m2, m1],
  ]) as History;
}

/** Freezes the whole structure: any write to the input throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('addMessage (TG-469)', () => {
  it('puts the new message first on the first page, the newest end', () => {
    const next = addMessage(history(), m5) as History;

    expect(next.pages[0]?.messages).toEqual([m5, m4, m3]);
  });

  it('leaves the other pages, the cursors and the page params as they were', () => {
    const before = history();

    const next = addMessage(before, m5) as History;

    expect(next.pages[1]).toBe(before.pages[1]);
    expect(next.pages[0]?.next_cursor).toBe(before.pages[0]?.next_cursor);
    expect(next.pageParams).toEqual(before.pageParams);
  });

  it('does not change what it was given', () => {
    const before = deepFreeze(history());

    expect(() => addMessage(before, m5)).not.toThrow();
    expect(addMessage(before, m5)).not.toBe(before);
    expect(before.pages[0]?.messages).toEqual([m4, m3]);
  });

  it.each([
    ['the first page', m4],
    ['an older page', m1],
  ])('returns the same object when the message is already in %s', (_where, message) => {
    const before = history();

    expect(addMessage(before, message)).toBe(before);
  });

  it('knows a message by its id, not by its content', () => {
    const before = history();
    const sameIdOtherText = { ...m1, text: 'Un altre text' };

    expect(addMessage(before, sameIdOtherText)).toBe(before);
  });

  it('keeps nothing when there is no history yet', () => {
    expect(addMessage(undefined, m5)).toBeUndefined();
  });

  describe('a message that arrives out of order', () => {
    const at = (n: number, sentAt: string) => makeMessage(n, { sent_at: sentAt }) as ChatMessage;
    const newer = at(20, '2026-11-17T10:20:00Z');
    const older = at(10, '2026-11-17T10:10:00Z');

    function page0(...messages: ChatMessage[]) {
      return makeHistoryData([messages, [m1]]) as History;
    }
    const idsOfPage0 = (data: History | undefined) =>
      data?.pages[0]?.messages.map((message) => message.id);

    it('goes where its sent_at puts it on the first page, newest first', () => {
      const between = at(15, '2026-11-17T10:15:00Z');

      const next = addMessage(page0(newer, older), between) as History;

      expect(idsOfPage0(next)).toEqual([newer.id, between.id, older.id]);
    });

    it('goes at the end of the first page when it is older than all of it', () => {
      const oldest = at(5, '2026-11-17T10:05:00Z');

      const next = addMessage(page0(newer, older), oldest) as History;

      expect(idsOfPage0(next)).toEqual([newer.id, older.id, oldest.id]);
      expect(next.pages[1]?.messages).toEqual([m1]);
    });

    it('with the same sent_at, the bigger id is the newer one', () => {
      const sameTimeSmallerId = at(19, newer.sent_at);
      const sameTimeBiggerId = at(21, newer.sent_at);

      expect(idsOfPage0(addMessage(page0(newer, older), sameTimeSmallerId) as History)).toEqual([
        newer.id,
        sameTimeSmallerId.id,
        older.id,
      ]);
      expect(idsOfPage0(addMessage(page0(newer, older), sameTimeBiggerId) as History)).toEqual([
        sameTimeBiggerId.id,
        newer.id,
        older.id,
      ]);
    });

    it('compares instants, not the text of the timestamp', () => {
      // 11:12+01:00 is 10:12Z: between 10:20Z and 10:10Z.
      const withOffset = at(12, '2026-11-17T11:12:00+01:00');

      const next = addMessage(page0(newer, older), withOffset) as History;

      expect(idsOfPage0(next)).toEqual([newer.id, withOffset.id, older.id]);
    });

    it('is still added once, without changing what it was given', () => {
      const before = deepFreeze(page0(newer, older));
      const between = at(15, '2026-11-17T10:15:00Z');

      const next = addMessage(before, between);

      expect(addMessage(next, between)).toBe(next);
      expect(idsOfPage0(before)).toEqual([newer.id, older.id]);
    });

    it('fills an empty first page', () => {
      const next = addMessage(makeHistoryData([[]]) as History, newer) as History;

      expect(idsOfPage0(next)).toEqual([newer.id]);
    });
  });
});

describe('flattenMessages (TG-469)', () => {
  it('joins the pages in order, newest first', () => {
    expect(flattenMessages(history())).toEqual([m4, m3, m2, m1]);
  });

  it('keeps one copy of a message that two pages share (a refetch moved the cursor)', () => {
    const overlapping = makeHistoryData([
      [m4, m3],
      [m3, m2, m1],
    ]) as History;

    expect(flattenMessages(overlapping).map((message) => message.id)).toEqual([
      m4.id,
      m3.id,
      m2.id,
      m1.id,
    ]);
  });

  it('is empty when there are no pages yet', () => {
    expect(flattenMessages(undefined)).toEqual([]);
    expect(flattenMessages(makeHistoryData([[]]) as History)).toEqual([]);
  });
});
