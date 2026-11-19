import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { makeMessage, PAU } from '../../../../__mocks__/chat';
import type { ChatMessage } from '../api/chat';
import type { ChatListItem, DayItem, MessageItem } from '../chatItems';
import { MessageList } from './MessageList';

// The stand-in of Reanimated applies a style once and never animates, so a bubble that floats
// in stays on its first frame: transparent. That is what tells it apart here (TG-469).

function message(n: number): MessageItem {
  const data = makeMessage(n, { author: PAU, sent_at: '2026-11-17T10:00:00Z' }) as ChatMessage;
  return { kind: 'message', key: data.id, message: data, mine: false, showAuthor: true };
}
const day: DayItem = { kind: 'day', key: 'day-2026-11-17', date: '2026-11-17T09:00:00Z' };

function list(items: ChatListItem[]) {
  return (
    <MessageList
      items={items}
      hasMore={false}
      isFetchingMore={false}
      onLoadOlder={jest.fn()}
      onRetry={jest.fn()}
    />
  );
}
/** Opacity of the frame of a bubble on its first frame. */
function opacityOf(item: MessageItem) {
  const frame = screen.getByTestId(`chat-message-${item.key}`).parent;
  return StyleSheet.flatten(frame?.props.style)?.opacity;
}

describe('MessageList, what floats in (TG-469)', () => {
  const m1 = message(1);
  const m2 = message(2);

  it('the history is there at once', async () => {
    await render(list([m2, m1, day]));

    expect(opacityOf(m2)).toBe(1);
    expect(opacityOf(m1)).toBe(1);
  });

  it('a message that arrives while the room is open floats in; the others stay put', async () => {
    const m3 = message(3);
    const { rerender } = await render(list([m2, m1, day]));

    await rerender(list([m3, m2, m1, day]));

    expect(opacityOf(m3)).toBe(0);
    expect(opacityOf(m2)).toBe(1);
  });

  it('an older page is there at once', async () => {
    const m0 = message(0);
    const { rerender } = await render(list([m2, m1, day]));

    await rerender(list([m2, m1, day, m0]));

    expect(opacityOf(m0)).toBe(1);
  });
});
