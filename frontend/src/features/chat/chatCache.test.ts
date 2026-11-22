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
