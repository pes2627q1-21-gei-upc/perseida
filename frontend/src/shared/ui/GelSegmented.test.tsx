import { fireEvent, render, screen } from '@testing-library/react-native';

import { GelSegmented } from './GelSegmented';

const OPTIONS = [
  { value: 'map', label: 'Mapa' },
  { value: 'list', label: 'Llista' },
] as const;

describe('GelSegmented', () => {
  it('shows each option as a tab of a named tab list', async () => {
    await render(
      <GelSegmented
        options={OPTIONS}
        value="map"
        onChange={jest.fn()}
        accessibilityLabel="Vista"
      />,
    );

    // A tab list is a container, not an accessibility element, so it is found by its label.
    expect(screen.getByLabelText('Vista').props.accessibilityRole).toBe('tablist');
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Mapa',
      'Llista',
    ]);
  });

  it('announces which option is selected', async () => {
    await render(
      <GelSegmented
        options={OPTIONS}
        value="list"
        onChange={jest.fn()}
        accessibilityLabel="Vista"
      />,
    );

    expect(screen.getByRole('tab', { name: 'Llista', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Mapa', selected: false })).toBeTruthy();
  });

  it('reports the option the user picks, but not the one already selected', async () => {
    const onChange = jest.fn();
    await render(
      <GelSegmented options={OPTIONS} value="map" onChange={onChange} accessibilityLabel="Vista" />,
    );

    await fireEvent.press(screen.getByRole('tab', { name: 'Mapa' }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Llista' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('gives each option a touch target of at least 48', async () => {
    await render(
      <GelSegmented
        options={OPTIONS}
        value="map"
        onChange={jest.fn()}
        accessibilityLabel="Vista"
      />,
    );

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveStyle({ minHeight: 48 });
    }
  });

  it('can be a choice of options instead of tabs, announced as checked', async () => {
    await render(
      <GelSegmented
        options={OPTIONS}
        value="list"
        onChange={jest.fn()}
        accessibilityLabel="Mostra"
        kind="choice"
      />,
    );

    expect(screen.getByLabelText('Mostra').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Llista', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Mapa', checked: false })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toEqual([]);
  });
});
