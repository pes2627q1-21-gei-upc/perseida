import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { touch } from '../../../shared/theme';
import type { ConversationView } from '../types';
import { ConversationRow } from './ConversationRow';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const NOW = new Date('2026-11-19T15:00:00Z');
// Same day as NOW at midday UTC: any device time zone keeps it on the 19th.
const SENT_TODAY = '2026-11-19T12:00:00Z';
const SENT_BEFORE = '2026-11-10T12:00:00Z';

function timeOf(iso: string) {
  return new Intl.DateTimeFormat('ca', { timeStyle: 'short' }).format(new Date(iso));
}
function dateOf(iso: string) {
  return new Intl.DateTimeFormat('ca', { dateStyle: 'short' }).format(new Date(iso));
}

function conversation(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'c-1',
    otherUser: { id: 'u-2', displayName: 'Laia' },
    lastMessage: { preview: 'Ens veiem a la muntanya?', sentAt: SENT_TODAY, fromMe: false },
    unreadCount: 0,
    blockedByMe: false,
    ...overrides,
  };
}

async function renderRow(props: { conversation: ConversationView; onPress?: () => void }) {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ConversationRow now={NOW} {...props} />
    </SafeAreaProvider>,
  );
}

describe('ConversationRow (TG-65)', () => {
  it('shows the name, the last message and its time', async () => {
    await renderRow({ conversation: conversation() });

    expect(screen.getByText('Laia')).toBeOnTheScreen();
    expect(screen.getByText('Ens veiem a la muntanya?')).toBeOnTheScreen();
    expect(screen.getByText(timeOf(SENT_TODAY))).toBeOnTheScreen();
  });

  it('shows the date instead of the time for a message of another day', async () => {
    await renderRow({
      conversation: conversation({
        lastMessage: { preview: 'Fa dies', sentAt: SENT_BEFORE, fromMe: false },
      }),
    });

    expect(screen.getByText(dateOf(SENT_BEFORE))).toBeOnTheScreen();
  });

  it('cuts the preview to one line but never the name (scalable text)', async () => {
    await renderRow({ conversation: conversation() });

    expect(screen.getByText('Ens veiem a la muntanya?').props.numberOfLines).toBe(1);
    expect(screen.getByText('Laia').props.numberOfLines).toBeUndefined();
  });

  it('starts the preview with «Tu: » when the last message is mine', async () => {
    await renderRow({
      conversation: conversation({
        lastMessage: { preview: 'Sí, a les nou', sentAt: SENT_TODAY, fromMe: true },
      }),
    });

    expect(screen.getByText('Tu: Sí, a les nou')).toBeOnTheScreen();
  });

  it('says there are no messages yet, with no time, for a new conversation', async () => {
    await renderRow({ conversation: conversation({ lastMessage: undefined }) });

    expect(screen.getByText('Encara no hi ha missatges')).toBeOnTheScreen();
    expect(screen.queryByText(timeOf(SENT_TODAY))).toBeNull();
  });

  it('shows the initial of the name when there is no avatar', async () => {
    await renderRow({ conversation: conversation() });

    expect(screen.getByText('L')).toBeOnTheScreen();
    expect(screen.queryByTestId('direct-conversation-avatar-image')).toBeNull();
  });

  it('shows the avatar picture, decorative, when there is one', async () => {
    await renderRow({
      conversation: conversation({
        otherUser: { id: 'u-2', displayName: 'Laia', avatarUrl: 'https://example.test/laia.png' },
      }),
    });

    const image = screen.getByTestId('direct-conversation-avatar-image');
    expect(image.props.source).toEqual({ uri: 'https://example.test/laia.png' });
    expect(image.props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByText('L')).toBeNull();
  });

  it('shows no unread badge when there is nothing unread', async () => {
    await renderRow({ conversation: conversation({ unreadCount: 0 }) });

    expect(screen.queryByTestId('unread-badge')).toBeNull();
  });

  it('shows the unread count', async () => {
    await renderRow({ conversation: conversation({ unreadCount: 3 }) });

    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('shows a «blocked» mark, with text, when I have blocked the other user', async () => {
    await renderRow({ conversation: conversation({ blockedByMe: true }) });

    expect(screen.getByText('Bloquejat')).toBeOnTheScreen();
  });

  it('shows no «blocked» mark otherwise', async () => {
    await renderRow({ conversation: conversation() });

    expect(screen.queryByText('Bloquejat')).toBeNull();
  });

  describe('accessible name', () => {
    it('is «Conversa amb X, últim missatge: …, hora» with nothing unread', async () => {
      await renderRow({ conversation: conversation() });

      expect(
        screen.getByLabelText(
          `Conversa amb Laia, últim missatge: Ens veiem a la muntanya?, ${timeOf(SENT_TODAY)}`,
        ),
      ).toBeOnTheScreen();
    });

    it('adds the unread count, in full and in the plural, after the name', async () => {
      await renderRow({ conversation: conversation({ unreadCount: 120 }) });

      expect(
        screen.getByLabelText(
          `Conversa amb Laia, 120 missatges sense llegir, últim missatge: Ens veiem a la muntanya?, ${timeOf(SENT_TODAY)}`,
        ),
      ).toBeOnTheScreen();
    });

    it('says «Tu:» for my own last message', async () => {
      await renderRow({
        conversation: conversation({
          lastMessage: { preview: 'Sí', sentAt: SENT_TODAY, fromMe: true },
        }),
      });

      expect(
        screen.getByLabelText(`Conversa amb Laia, últim missatge: Tu: Sí, ${timeOf(SENT_TODAY)}`),
      ).toBeOnTheScreen();
    });

    it('says the conversation is blocked', async () => {
      await renderRow({
        conversation: conversation({ blockedByMe: true, lastMessage: undefined }),
      });

      expect(
        screen.getByLabelText('Conversa amb Laia, Bloquejat, Encara no hi ha missatges'),
      ).toBeOnTheScreen();
    });
  });

  it('has the test id of its conversation', async () => {
    await renderRow({ conversation: conversation({ id: 'abc' }), onPress: jest.fn() });

    expect(screen.getByTestId('direct-conversation-abc')).toBeOnTheScreen();
  });

  describe('with onPress', () => {
    it('is a button with a target of at least 48 dp', async () => {
      await renderRow({ conversation: conversation(), onPress: jest.fn() });

      const button = screen.getByRole('button');
      expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(touch.min);
    });

    it('calls onPress when it is tapped', async () => {
      const onPress = jest.fn();
      await renderRow({ conversation: conversation(), onPress });

      await fireEvent.press(screen.getByRole('button'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('without onPress', () => {
    it('is not a button, but it is still read as one element', async () => {
      await renderRow({ conversation: conversation() });

      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByTestId('direct-conversation-c-1').props.accessible).toBe(true);
    });
  });
});
