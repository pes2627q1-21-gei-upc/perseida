import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '../../../shared/i18n';
import { readingMaxWidth } from '../../../shared/theme';
import { MapControls } from './MapControls';

// An iPhone with a home indicator: safe areas at the bottom and the sides.
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 4, right: 6, bottom: 34 },
};

async function renderControls(
  props: Partial<{
    onViewChange: jest.Mock;
    onFilterChange: jest.Mock;
    outingsUnavailable: boolean;
  }> = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <MapControls
        view="map"
        onViewChange={props.onViewChange ?? jest.fn()}
        filter="all"
        onFilterChange={props.onFilterChange ?? jest.fn()}
        outingsUnavailable={props.outingsUnavailable}
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

  it('offers the active, upcoming, outings and all filter as a choice of four (criterion 2, TG-646)', async () => {
    await renderControls();

    expect(screen.getByLabelText('Mostra').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
      'Actius',
      'Futurs',
      'Sortides',
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

  it('reports the Outings filter (TG-646 criterion 2)', async () => {
    const onFilterChange = jest.fn();
    await renderControls({ onFilterChange });

    await fireEvent.press(screen.getByRole('radio', { name: 'Sortides' }));

    expect(onFilterChange).toHaveBeenCalledWith('outings');
  });

  it('says in its panel that the outings could not be loaded, only when so (TG-646 criterion 5)', async () => {
    const view = await renderControls({ outingsUnavailable: true });

    expect(
      within(screen.getByTestId('map-controls-panel')).getByText(
        i18n.t('events.outings.unavailable'),
      ),
    ).toBeTruthy();
    expect(i18n.t('events.outings.unavailable')).not.toBe('events.outings.unavailable');
    view.unmount();

    await renderControls();
    expect(screen.queryByText(i18n.t('events.outings.unavailable'))).toBeNull();
  });

  it('sits above the home indicator, between the side margins', async () => {
    await renderControls();

    const bar = StyleSheet.flatten(screen.getByTestId('map-controls').props.style);
    expect(bar).toMatchObject({ paddingBottom: 34 + 8, paddingLeft: 4 + 16, paddingRight: 6 + 16 });
    expect(bar.position).toBeUndefined();
    const panel = StyleSheet.flatten(screen.getByTestId('map-controls-panel').props.style);
    expect(panel).toMatchObject({ maxWidth: readingMaxWidth });
  });

  it('aligns the panel to the left, at its own width, with the margin of the screen (TG-647)', async () => {
    await renderControls();

    const bar = StyleSheet.flatten(screen.getByTestId('map-controls').props.style);
    const panel = StyleSheet.flatten(screen.getByTestId('map-controls-panel').props.style);
    expect(panel.alignSelf).toBe('flex-start');
    expect(panel.width).toBeUndefined();
    expect(bar.alignItems).not.toBe('center');
    // The left margin is spacing.md (16) beside the safe area.
    expect(bar.paddingLeft).toBe(4 + 16);
  });
});
