import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { readingMaxWidth } from '../../../shared/theme';
import { MapTopBar } from './MapTopBar';

// An iPhone with a notch: 390 wide, with safe areas at the top and the sides.
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 4, right: 6, bottom: 34 },
};

async function renderBar() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <MapTopBar view="map" onViewChange={jest.fn()} onBack={jest.fn()} />
    </SafeAreaProvider>,
  );
}

describe('MapTopBar', () => {
  it('stays between equal margins and the safe areas, without overflowing the screen', async () => {
    await renderBar();

    const bar = StyleSheet.flatten(screen.getByTestId('map-top-bar').props.style);
    // Pinned to both edges: a width of 100 % on top of `left` would push it out on the right.
    expect(bar).toMatchObject({ position: 'absolute', left: 0, right: 0, top: 47 + 8 });
    expect(bar.width).toBeUndefined();
    expect(bar).toMatchObject({ paddingLeft: 4 + 16, paddingRight: 6 + 16 });
  });

  it('keeps a readable width on wide screens', async () => {
    await renderBar();

    const panel = StyleSheet.flatten(screen.getByTestId('map-top-bar-panel').props.style);
    expect(panel).toMatchObject({ width: '100%', maxWidth: readingMaxWidth });
  });

  it('gives each view option half of the switch', async () => {
    await renderBar();

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveStyle({ flex: 1 });
    }
  });
});
