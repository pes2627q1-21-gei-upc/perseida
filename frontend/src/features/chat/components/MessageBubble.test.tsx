import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { makeMessage, PAU } from '../../../../__mocks__/chat';
import { colors } from '../../../shared/theme';
import type { ChatMessage } from '../api/chat';
import { bubbleSurface } from '../bubbleSurface';
import type { MessageItem, PendingItem } from '../chatItems';
import { MessageBubble } from './MessageBubble';

const SENT_AT = '2026-11-17T10:00:00Z';
/** The time as the bubble says it: short, in the language of the app, in the device time zone. */
const TIME = new Intl.DateTimeFormat('ca', { timeStyle: 'short' }).format(new Date(SENT_AT));

function messageItem(
  overrides: Partial<MessageItem> & { message?: ChatMessage } = {},
): MessageItem {
  const message = overrides.message ?? (makeMessage(1, { sent_at: SENT_AT }) as ChatMessage);
  return {
    kind: 'message',
    key: message.id,
    message,
    mine: false,
    showAuthor: false,
    ...overrides,
  };
}
function pendingItem(status: PendingItem['status'], text = 'Hola a tothom'): PendingItem {
  return { kind: 'pending', key: 'client-1', clientMessageId: 'client-1', text, status };
}
function bubble(key: string) {
  return screen.getByTestId(`chat-message-${key}`);
}

afterEach(() => jest.restoreAllMocks());

describe('MessageBubble, message of the history (TG-469)', () => {
  it('is one element, read as «author, time: text» (WCAG 1.3.1)', async () => {
    const item = messageItem({ showAuthor: true });

    await render(<MessageBubble item={item} />);

    expect(bubble(item.key)).toHaveAccessibleName(`Laia, ${TIME}: Missatge 1`);
    expect(screen.getByText('Missatge 1')).toBeOnTheScreen();
  });

  it('is read as «Tu» when it is mine, and the name is not repeated on the screen', async () => {
    const item = messageItem({ mine: true, showAuthor: false });

    await render(<MessageBubble item={item} />);

    expect(bubble(item.key)).toHaveAccessibleName(`Tu, ${TIME}: Missatge 1`);
    expect(screen.queryByText('Tu')).not.toBeOnTheScreen();
    expect(screen.queryByText('Laia')).not.toBeOnTheScreen();
  });

  it('shows the name of the author only when it is the start of a run', async () => {
    const message = makeMessage(2, { author: PAU, sent_at: SENT_AT }) as ChatMessage;
    const { rerender } = await render(
      <MessageBubble item={messageItem({ message, showAuthor: true })} />,
    );
    expect(screen.getByText('Pau')).toBeOnTheScreen();

    await rerender(<MessageBubble item={messageItem({ message, showAuthor: false })} />);
    expect(screen.queryByText('Pau')).not.toBeOnTheScreen();
    // Not shown, but still read: every message tells who wrote it.
    expect(bubble(message.id)).toHaveAccessibleName(`Pau, ${TIME}: Missatge 2`);
  });

  it('says «Una usuària de Perseida» when the author has no name', async () => {
    const message = makeMessage(3, {
      author: { id: PAU.id, name: null },
      sent_at: SENT_AT,
    }) as ChatMessage;

    await render(<MessageBubble item={messageItem({ message, showAuthor: true })} />);

    expect(screen.getByText('Una usuària de Perseida')).toBeOnTheScreen();
    expect(bubble(message.id)).toHaveAccessibleName(`Una usuària de Perseida, ${TIME}: Missatge 3`);
  });

  it('keeps the text as it was written, line breaks and all', async () => {
    const message = makeMessage(4, { text: 'Primera\nSegona', sent_at: SENT_AT }) as ChatMessage;

    await render(<MessageBubble item={messageItem({ message })} />);

    expect(screen.getByText('Primera\nSegona')).toBeOnTheScreen();
  });

  it('has no retry button and is not busy', async () => {
    const item = messageItem();

    await render(<MessageBubble item={item} onRetry={jest.fn()} />);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(bubble(item.key).props.accessibilityState?.busy).toBeFalsy();
  });

  it.each([
    ['mine', true],
    ['others', false],
  ])('the bubble of %s is on its own glass surface', async (_side, mine) => {
    const item = messageItem({ mine });

    await render(<MessageBubble item={item} />);

    expect(bubble(item.key)).toHaveStyle({
      backgroundColor: bubbleSurface(colors.dia, mine, false).background,
    });
  });

  it('goes on solid colour with «Reduce transparency»', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    const item = messageItem({ mine: true });

    await act(async () => {
      await render(<MessageBubble item={item} />);
    });

    expect(bubble(item.key)).toHaveStyle({
      backgroundColor: bubbleSurface(colors.dia, true, true).background,
    });
  });
});

describe('MessageBubble, message being sent (TG-469)', () => {
  it('is read as mine and marked as busy while it is sent', async () => {
    await render(<MessageBubble item={pendingItem('sending')} />);

    expect(bubble('client-1')).toHaveAccessibleName(/^Tu: Hola a tothom/);
    expect(bubble('client-1').props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByText('Hola a tothom')).toBeOnTheScreen();
    expect(screen.getByText('Enviant')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('is on the surface of my messages', async () => {
    await render(<MessageBubble item={pendingItem('sending')} />);

    expect(bubble('client-1')).toHaveStyle({
      backgroundColor: bubbleSurface(colors.dia, true, false).background,
    });
  });
});

describe('MessageBubble, message that did not go (TG-469)', () => {
  it('failed: says so in text, not only by colour, and offers to retry (WCAG 1.4.1)', async () => {
    await render(<MessageBubble item={pendingItem('failed')} onRetry={jest.fn()} />);

    expect(screen.getByText('Hola a tothom')).toBeOnTheScreen();
    expect(screen.getByText("No s'ha pogut enviar el missatge.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Reintenta' })).toBeOnTheScreen();
    expect(bubble('client-1').props.accessibilityState?.busy).toBeFalsy();
  });

  it('uncertain: explains that it may have been sent already', async () => {
    await render(<MessageBubble item={pendingItem('uncertain')} onRetry={jest.fn()} />);

    expect(screen.getByText(/ja s'hagi enviat/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Reintenta' })).toBeOnTheScreen();
  });

  it.each(['failed', 'uncertain'] as const)(
    '%s: retrying gives back the same clientMessageId, so the server can tell it is the same message',
    async (status) => {
      const onRetry = jest.fn();
      await render(<MessageBubble item={pendingItem(status)} onRetry={onRetry} />);

      await fireEvent.press(screen.getByRole('button', { name: 'Reintenta' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith('client-1');
    },
  );

  it('the retry button is a comfortable touch target (WCAG 2.5.8)', async () => {
    await render(<MessageBubble item={pendingItem('failed')} onRetry={jest.fn()} />);

    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Reintenta' }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });
});
