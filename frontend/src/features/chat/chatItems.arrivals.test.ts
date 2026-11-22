import { makeMessage, PAU } from '../../../__mocks__/chat';
import type { ChatMessage } from './api/chat';
import { arrivedKeys, type ChatListItem, type DayItem } from './chatItems';

/** A message of the list, newest first as the list holds them; `mine` says who wrote it. */
function message(n: number, mine = false): ChatListItem {
  const data = makeMessage(n, mine ? {} : { author: PAU }) as ChatMessage;
  return { kind: 'message', key: data.id, message: data, mine, showAuthor: false };
}
function pending(id: string): ChatListItem {
  return { kind: 'pending', key: id, clientMessageId: id, text: 'Hola', status: 'sending' };
}
function day(date: string): DayItem {
  return { kind: 'day', key: `day-${date}`, date: `${date}T09:00:00Z` };
}
const keys = (...items: ChatListItem[]) => items.map((item) => item.key);

// Only what arrives while the room is open floats in: the history, older pages and my own
// confirmed messages (which take the place of their pending bubble) appear at once (TG-469).
describe('arrivedKeys (TG-469)', () => {
  const m1 = message(1);
  const m2 = message(2);
  const d17 = day('2026-11-17');

  it('nothing arrives on the first list: that is the history', () => {
    expect(arrivedKeys([m2, m1, d17], [])).toEqual(new Set());
  });

  it('a message of someone else at the newest end has arrived', () => {
    const m3 = message(3);

    expect(arrivedKeys([m3, m2, m1, d17], [m2, m1, d17])).toEqual(new Set(keys(m3)));
  });

  it('several new ones at the newest end have all arrived, and a pending one too', () => {
    const m3 = message(3);
    const p1 = pending('c1');

    expect(arrivedKeys([p1, m3, m2, m1, d17], [m2, m1, d17])).toEqual(new Set(keys(p1, m3)));
  });

  it('older pages, at the other end, have not arrived: they were already said', () => {
    const m0 = message(0);
    const d16 = day('2026-11-16');

    expect(arrivedKeys([m2, m1, d17, m0, d16], [m2, m1, d17])).toEqual(new Set());
  });

  it('my own confirmed message does not float in again: its pending bubble was already there', () => {
    const mine = message(3, true);

    expect(arrivedKeys([mine, m2, m1, d17], [pending('c1'), m2, m1, d17])).toEqual(new Set());
  });

  it('a new day separator does not float, the message that opens the day does', () => {
    const m3 = message(3);
    const d18 = day('2026-11-18');

    expect(arrivedKeys([m3, d18, m2, m1, d17], [m2, m1, d17])).toEqual(new Set(keys(m3)));
  });

  it('a pending message drawn below does not hide a message of someone else that has just arrived', () => {
    const failed = pending('c1');
    const m3 = message(3);

    expect(arrivedKeys([failed, m3, m2, m1, d17], [failed, m2, m1, d17])).toEqual(
      new Set(keys(m3)),
    );
  });

  it('a list that shares nothing with the previous one is a new history, not arrivals', () => {
    expect(arrivedKeys([message(9), message(8)], [m2, m1, d17])).toEqual(new Set());
  });

  it('the same list again has nothing new', () => {
    expect(arrivedKeys([m2, m1, d17], [m2, m1, d17])).toEqual(new Set());
  });
});
