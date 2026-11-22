import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../../../shared/theme';
import type { RoomListEntry } from '../roomList';
import { RoomListItem } from './RoomListItem';

// Reduced motion on: the stand-in of Reanimated always says «no», so this file says «yes».
jest.mock('react-native-reanimated', () => {
  const standIn = jest.requireActual('../../../../__mocks__/react-native-reanimated');
  return { __esModule: true, ...standIn, useReducedMotion: () => true };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ENTRY: RoomListEntry = {
  eventId: 'event-1',
  title: 'Leonids',
  startsAt: '2026-11-17T00:00:00Z',
  category: 'meteor_shower',
};

async function renderItem() {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <RoomListItem entry={ENTRY} now={new Date('2026-11-19T15:00:00Z')} />
    </SafeAreaProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

describe('RoomListItem states (TG-469)', () => {
  it('is shown at once, not floating in, with reduced motion', async () => {
    await renderItem();

    // The wrapper that floats the row in: fully opaque from the first frame.
    let wrapper = screen.getByTestId('chat-room-event-1').parent;
    while (wrapper && !StyleSheet.flatten(wrapper.props.style)?.transform) wrapper = wrapper.parent;
    expect(wrapper).toHaveStyle({ opacity: 1, transform: [{ translateY: 0 }] });
  });

  it('goes on solid glass with «Reduce transparency»', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);

    await act(async () => {
      await renderItem();
    });

    expect(screen.getByTestId('chat-room-event-1')).toHaveStyle({
      backgroundColor: colors.dia.surface.glassSolid,
    });
  });
});
