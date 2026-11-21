import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { touch } from '../../../shared/theme';
import type { RoomListEntry } from '../roomList';
import { RoomListItem } from './RoomListItem';

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

function entry(overrides: Partial<RoomListEntry> = {}): RoomListEntry {
  return {
    eventId: 'event-1',
    title: 'Leonids',
    startsAt: '2026-11-17T00:00:00Z',
    category: 'meteor_shower',
    lastMessage: { authorName: 'Laia', text: 'Hola a tothom!', sentAt: SENT_TODAY },
    ...overrides,
  };
}

async function renderItem(props: { entry: RoomListEntry; onPress?: () => void }) {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <RoomListItem now={NOW} {...props} />
    </SafeAreaProvider>,
  );
}

describe('RoomListItem (TG-469)', () => {
  it('shows the event title, the last message as «autor: text» and its time', async () => {
    await renderItem({ entry: entry() });

    expect(screen.getByText('Leonids')).toBeOnTheScreen();
    expect(screen.getByText('Laia: Hola a tothom!')).toBeOnTheScreen();
    expect(screen.getByText(timeOf(SENT_TODAY))).toBeOnTheScreen();
  });

  it('shows the date instead of the time when the message is from another day', async () => {
    await renderItem({
      entry: entry({ lastMessage: { authorName: 'Laia', text: 'Fa dies', sentAt: SENT_BEFORE } }),
    });

    expect(screen.getByText(dateOf(SENT_BEFORE))).toBeOnTheScreen();
  });

  it('says there are no messages yet, and shows no time, when the room is empty', async () => {
    await renderItem({ entry: entry({ lastMessage: undefined }) });

    expect(screen.getByText('Leonids')).toBeOnTheScreen();
    expect(screen.getByText('Encara no hi ha missatges')).toBeOnTheScreen();
    expect(screen.queryByText(timeOf(SENT_TODAY))).toBeNull();
  });

  it('uses a generic name when the author has no name', async () => {
    await renderItem({
      entry: entry({ lastMessage: { authorName: null, text: 'Bon vespre', sentAt: SENT_TODAY } }),
    });

    expect(screen.getByText('Una usuària de Perseida: Bon vespre')).toBeOnTheScreen();
  });

  it('is one accessible element named «títol, autor: text, hora»', async () => {
    await renderItem({ entry: entry() });

    const item = screen.getByLabelText(`Leonids, Laia: Hola a tothom!, ${timeOf(SENT_TODAY)}`);
    expect(item).toBeOnTheScreen();
    expect(item.props.accessible).toBe(true);
  });

  it('is named «títol, no hi ha missatges» when the room is empty', async () => {
    await renderItem({ entry: entry({ lastMessage: undefined }) });

    expect(screen.getByLabelText('Leonids, Encara no hi ha missatges')).toBeOnTheScreen();
  });

  describe('with onPress', () => {
    it('is a button with a target of at least 48 dp', async () => {
      await renderItem({ entry: entry(), onPress: jest.fn() });

      const button = screen.getByRole('button', {
        name: `Leonids, Laia: Hola a tothom!, ${timeOf(SENT_TODAY)}`,
      });
      expect(button).toHaveStyle({ minHeight: touch.min });
    });

    it('calls onPress when it is tapped', async () => {
      const onPress = jest.fn();
      await renderItem({ entry: entry(), onPress });

      await fireEvent.press(screen.getByRole('button'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('without onPress', () => {
    it('is not a button, but it is still read as one element', async () => {
      await renderItem({ entry: entry() });

      expect(screen.queryByRole('button')).toBeNull();
      expect(
        screen.getByLabelText(`Leonids, Laia: Hola a tothom!, ${timeOf(SENT_TODAY)}`),
      ).toBeOnTheScreen();
    });
  });
});
