import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  launchEvent,
  lunarEvent,
  meteorShowerEvent,
  solarEvent,
} from '../../../../__mocks__/events';
import i18n from '../../../shared/i18n';
import { type ClassifiedEvent, classifyEvents } from '../classifyEvents';
import { formatEventDateTime } from '../formatEvent';
import { EventSheet } from './EventSheet';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const { active, upcoming } = classifyEvents([meteorShowerEvent], [launchEvent, solarEvent]);
const [leonids] = active;
const [launch, eclipse] = upcoming;

async function renderSheet(event: ClassifiedEvent | null, onClose = jest.fn()) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <EventSheet event={event} onClose={onClose} />
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EventSheet', () => {
  it('shows nothing while no event is selected', async () => {
    await renderSheet(null);

    expect(screen.queryByRole('header')).toBeNull();
  });

  it('shows the title, the category and the start and end dates (criterion 3)', async () => {
    await renderSheet(launch);

    expect(screen.getByRole('header', { name: launchEvent.title })).toBeTruthy();
    expect(screen.getByText('Llançament')).toBeTruthy();
    expect(screen.getByText('Inici')).toBeTruthy();
    expect(
      screen.getByText(formatEventDateTime(launchEvent.starts_at, i18n.language)),
    ).toBeTruthy();
    expect(screen.getByText('Fi')).toBeTruthy();
    expect(screen.getByText(formatEventDateTime(launchEvent.ends_at, i18n.language))).toBeTruthy();
  });

  it('adds the summary and where the event can be seen', async () => {
    await renderSheet(launch);

    expect(screen.getByText(launchEvent.summary)).toBeTruthy();
    expect(screen.getByText('28,56° N · 80,58° O')).toBeTruthy();
  });

  it('says when the event is happening now', async () => {
    await renderSheet(leonids);

    expect(screen.getByText('Actiu ara')).toBeTruthy();
    expect(screen.getByText('Visible des de qualsevol lloc')).toBeTruthy();
  });

  it('opens the source in the browser', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderSheet(eclipse);

    await fireEvent.press(screen.getByRole('link', { name: 'Més informació' }));

    expect(openURL).toHaveBeenCalledWith(solarEvent.source_url);
  });

  it('has no source link when the event has no source', async () => {
    await renderSheet(classifyEvents([], [lunarEvent]).all[0]);

    expect(screen.queryByRole('link', { name: 'Més informació' })).toBeNull();
  });

  it('never opens a source that is not plain https', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderSheet({ ...launch, source_url: 'javascript:alert(1)' });

    expect(screen.queryByRole('link', { name: 'Més informació' })).toBeNull();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('closes with its button', async () => {
    const onClose = jest.fn();
    await renderSheet(launch, onClose);

    await fireEvent.press(screen.getByRole('button', { name: 'Tanca la fitxa' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the user taps outside it', async () => {
    const onClose = jest.fn();
    await renderSheet(launch, onClose);

    await fireEvent.press(screen.getByTestId('event-sheet-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape on the web and the back button on Android', async () => {
    const onClose = jest.fn();
    await renderSheet(launch, onClose);

    screen.getByTestId('event-sheet').props.onRequestClose();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
