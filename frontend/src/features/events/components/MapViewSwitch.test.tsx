import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { readingMaxWidth } from '../../../shared/theme';
import { MapViewSwitch } from './MapViewSwitch';

// An iPhone with a home indicator: safe areas at the bottom and the sides.
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 4, right: 6, bottom: 34 },
};

async function renderSwitch(onChange = jest.fn()) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <MapViewSwitch view="map" onChange={onChange} />
    </SafeAreaProvider>,
  );
}

describe('MapViewSwitch', () => {
  it('offers the map and the list views, with half of the switch each', async () => {
    await renderSwitch();

    expect(screen.getByLabelText('Vista').props.accessibilityRole).toBe('tablist');
    expect(screen.getByRole('tab', { name: 'Mapa', selected: true })).toBeTruthy();
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveStyle({ flex: 1 });
    }
  });

  it('reports the view the user picks', async () => {
    const onChange = jest.fn();
    await renderSwitch(onChange);

    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));

    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('sits above the home indicator, between the side margins', async () => {
    await renderSwitch();

    const bar = StyleSheet.flatten(screen.getByTestId('map-view-switch').props.style);
    expect(bar).toMatchObject({ paddingBottom: 34 + 8, paddingLeft: 4 + 16, paddingRight: 6 + 16 });
    expect(bar.position).toBeUndefined();
    const panel = StyleSheet.flatten(screen.getByTestId('map-view-switch-panel').props.style);
    expect(panel).toMatchObject({ width: '100%', maxWidth: readingMaxWidth });
  });
});
