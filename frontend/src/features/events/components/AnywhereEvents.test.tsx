import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { classifyEvents } from '../classifyEvents';
import { AnywhereEvents } from './AnywhereEvents';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderStrip(events = classifyEvents([meteorShowerEvent], [lunarEvent]).all) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <AnywhereEvents events={events} />
    </SafeAreaProvider>,
  );
}

describe('AnywhereEvents', () => {
  it('has a heading that says these events can be seen from anywhere', async () => {
    await renderStrip();

    expect(screen.getByRole('header', { name: 'Visibles des de qualsevol lloc' })).toBeTruthy();
  });

  it('lists the events, named for screen readers with their category and state', async () => {
    await renderStrip();

    // A list is a container, not an accessibility element, so it is found by its label.
    expect(screen.getByLabelText('Visibles des de qualsevol lloc').props.accessibilityRole).toBe(
      'list',
    );
    expect(screen.getByText(meteorShowerEvent.title)).toBeTruthy();
    expect(screen.getByText(lunarEvent.title)).toBeTruthy();
    expect(screen.getByLabelText(/^Leonids, Pluja d'estels, Actiu ara, /)).toBeTruthy();
    expect(screen.getByLabelText(/^Full Moon, Lluna, /)).toBeTruthy();
  });

  it('takes 2 parts of the screen to the 3 of the map, and scrolls inside them', async () => {
    await renderStrip();

    // The map above it has flex 3: it stays bigger, also with the top bar floating over it.
    expect(StyleSheet.flatten(screen.getByTestId('anywhere-events').props.style)).toMatchObject({
      flex: 2,
    });
    expect(screen.getByLabelText('Visibles des de qualsevol lloc')).toHaveStyle({ flex: 1 });
  });

  it('shows nothing when every event has a location', async () => {
    await renderStrip([]);

    expect(screen.queryByText('Visibles des de qualsevol lloc')).toBeNull();
  });
});
