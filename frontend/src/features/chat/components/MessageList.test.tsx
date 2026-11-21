import { fireEvent, render, screen } from '@testing-library/react-native';

import { makeMessage, PAU } from '../../../../__mocks__/chat';
import type { ChatMessage } from '../api/chat';
import type { ChatListItem, DayItem, MessageItem, PendingItem } from '../chatItems';
import { MessageList } from './MessageList';

const SENT_AT = '2026-11-17T10:00:00Z';
const TIME = new Intl.DateTimeFormat('ca', { timeStyle: 'short' }).format(new Date(SENT_AT));
/** The day as the separator says it: long date, in the language of the app. */
const DAY = new Intl.DateTimeFormat('ca', { dateStyle: 'long' }).format(new Date(SENT_AT));

function message(n: number, mine = false): MessageItem {
  const data = makeMessage(n, {
    sent_at: SENT_AT,
    ...(mine ? {} : { author: PAU }),
  }) as ChatMessage;
  return { kind: 'message', key: data.id, message: data, mine, showAuthor: !mine };
}
const day: DayItem = { kind: 'day', key: 'day-2026-11-17', date: SENT_AT };
const failed: PendingItem = {
  kind: 'pending',
  key: 'client-1',
  clientMessageId: 'client-1',
  text: 'No ha anat',
  status: 'failed',
};

interface Overrides {
  items?: ChatListItem[];
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadOlder?: () => void;
  onRetry?: (clientMessageId: string) => void;
  listProps?: Record<string, unknown>;
}
async function renderList({
  items = [message(2), message(1, true), day],
  hasMore = false,
  isFetchingMore = false,
  onLoadOlder = jest.fn(),
  onRetry = jest.fn(),
  listProps,
}: Overrides = {}) {
  await render(
    <MessageList
      items={items}
      hasMore={hasMore}
      isFetchingMore={isFetchingMore}
      onLoadOlder={onLoadOlder}
      onRetry={onRetry}
      listProps={listProps}
    />,
  );
}
function list() {
  return screen.getByTestId('chat-messages-list');
}

describe('MessageList (TG-469)', () => {
  it('is an inverted, labelled list: the newest message is at the bottom (WCAG 1.3.1)', async () => {
    await renderList();

    expect(list().props.inverted).toBe(true);
    expect(list()).toHaveAccessibleName('Missatges del xat');
  });

  it('draws each message as a bubble', async () => {
    await renderList();

    expect(screen.getByLabelText(`Pau, ${TIME}: Missatge 2`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Tu, ${TIME}: Missatge 1`)).toBeOnTheScreen();
  });

  it('draws the day separator as a header with the date in the language of the app', async () => {
    await renderList();

    expect(screen.getByRole('header', { name: DAY })).toBeOnTheScreen();
  });

  it('draws a pending message and passes its id when the person retries it', async () => {
    const onRetry = jest.fn();
    await renderList({ items: [failed, message(1), day], onRetry });

    await fireEvent.press(screen.getByRole('button', { name: 'Reintenta' }));

    expect(onRetry).toHaveBeenCalledWith('client-1');
  });

  it('draws nothing at all when there is nothing to show, the screen has its own empty state', async () => {
    await renderList({ items: [] });

    expect(screen.queryByTestId('chat-messages-list')).not.toBeOnTheScreen();
    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
  });

  describe('older messages', () => {
    it('are asked for when the top is reached and there are more', async () => {
      const onLoadOlder = jest.fn();
      await renderList({ hasMore: true, onLoadOlder });

      await fireEvent(list(), 'endReached');

      expect(onLoadOlder).toHaveBeenCalledTimes(1);
    });

    it('are asked for before the very top, at half a screen from it', async () => {
      await renderList({ hasMore: true, onLoadOlder: jest.fn() });

      expect(list().props.onEndReachedThreshold).toBe(0.5);
    });

    it('are not asked for when there are no more', async () => {
      const onLoadOlder = jest.fn();
      await renderList({ hasMore: false, onLoadOlder });

      await fireEvent(list(), 'endReached');

      expect(onLoadOlder).not.toHaveBeenCalled();
    });

    it('are not asked for again while a page is already coming', async () => {
      const onLoadOlder = jest.fn();
      await renderList({ hasMore: true, isFetchingMore: true, onLoadOlder });

      await fireEvent(list(), 'endReached');

      expect(onLoadOlder).not.toHaveBeenCalled();
    });

    it('show a labelled spinner at the top while they load, and only then', async () => {
      await renderList({ hasMore: true, isFetchingMore: true });
      expect(screen.getByLabelText('Carregant missatges anteriors')).toBeOnTheScreen();
    });

    it('show no spinner when nothing is loading', async () => {
      await renderList({ hasMore: true, isFetchingMore: false });
      expect(screen.queryByLabelText('Carregant missatges anteriors')).not.toBeOnTheScreen();
    });
  });

  it('hands the rest of the list props to the list (keyboard behaviour, scroll handlers)', async () => {
    await renderList({ listProps: { keyboardShouldPersistTaps: 'handled' } });

    expect(list().props.keyboardShouldPersistTaps).toBe('handled');
  });
});
