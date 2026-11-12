import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { readingMaxWidth } from '../../../shared/theme';
import { MapControls } from './MapControls';

// An iPhone with a home indicator: safe areas at the bottom and the sides.
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 4, right: 6, bottom: 34 },
};

async function renderControls(
  props: Partial<{ onViewChange: jest.Mock; onFilterChange: jest.Mock }> = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <MapControls
        view="map"
        onViewChange={props.onViewChange ?? jest.fn()}
        filter="all"
        onFilterChange={props.onFilterChange ?? jest.fn()}
      />
    </SafeAreaProvider>,
  );
}

describe('MapControls', () => {
  it('offers the map and the list views, with half of the switch each', async () => {
    await renderControls();

    expect(screen.getByLabelText('Vista').props.accessibilityRole).toBe('tablist');
    expect(screen.getByRole('tab', { name: 'Mapa', selected: true })).toBeTruthy();
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveStyle({ flex: 1 });
    }
  });

  it('reports the view the user picks', async () => {
    const onViewChange = jest.fn();
    await renderControls({ onViewChange });

    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));

    expect(onViewChange).toHaveBeenCalledWith('list');
  });

  it('offers the active, upcoming and all filter as a choice of three (criterion 2)', async () => {
    await renderControls();

    expect(screen.getByLabelText('Mostra').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
      'Actius',
      'Futurs',
      'Tots',
    ]);
    expect(screen.getByRole('radio', { name: 'Tots', checked: true })).toBeTruthy();
  });

  it('reports the filter the user picks', async () => {
    const onFilterChange = jest.fn();
    await renderControls({ onFilterChange });

    await fireEvent.press(screen.getByRole('radio', { name: 'Actius' }));

    expect(onFilterChange).toHaveBeenCalledWith('active');
  });

  it('sits above the home indicator, between the side margins', async () => {
    await renderControls();

    const bar = StyleSheet.flatten(screen.getByTestId('map-controls').props.style);
    expect(bar).toMatchObject({ paddingBottom: 34 + 8, paddingLeft: 4 + 16, paddingRight: 6 + 16 });
    expect(bar.position).toBeUndefined();
    const panel = StyleSheet.flatten(screen.getByTestId('map-controls-panel').props.style);
    expect(panel).toMatchObject({ width: '100%', maxWidth: readingMaxWidth });
  });
});
