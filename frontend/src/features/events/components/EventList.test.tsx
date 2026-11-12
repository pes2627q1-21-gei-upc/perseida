import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { classifyEvents } from '../classifyEvents';
import { EventList } from './EventList';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const { all } = classifyEvents([meteorShowerEvent], [launchEvent, lunarEvent]);

async function renderList() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <EventList events={all} label="Llista d'esdeveniments" />
    </SafeAreaProvider>,
  );
}

describe('EventList', () => {
  it('lists every event, also the ones without a location', async () => {
    await renderList();

    // A list is a container, not an accessibility element, so it is found by its label.
    expect(screen.getByLabelText("Llista d'esdeveniments").props.accessibilityRole).toBe('list');
    for (const event of [launchEvent, meteorShowerEvent, lunarEvent]) {
      expect(screen.getByText(event.title)).toBeTruthy();
    }
  });

  it('says where each event can be seen', async () => {
    await renderList();

    expect(screen.getByText('28,56° N · 80,58° O')).toBeTruthy();
    expect(screen.getAllByText('Visible des de qualsevol lloc')).toHaveLength(2);
  });

  it('marks the events that are happening now with text, not only with colour', async () => {
    await renderList();

    expect(screen.getAllByText('Actiu ara')).toHaveLength(1);
  });

  it('reads each row as one item that names the event, its category and its state', async () => {
    await renderList();

    expect(screen.getByLabelText(/^Leonids, Pluja d'estels, Actiu ara/)).toBeTruthy();
    expect(screen.getByLabelText(/^Full Moon, Lluna, /)).toBeTruthy();
  });
});
