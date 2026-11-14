import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler, Linking, Platform } from 'react-native';
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

async function renderSheet(event: ClassifiedEvent | null, onClose = jest.fn(), side = false) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <EventSheet event={event} onClose={onClose} side={side} />
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  // Linking.openURL is already a mock in jest-expo: clear its calls between tests.
  jest.clearAllMocks();
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

    // The backdrop is hidden from screen readers on purpose: they get the close button.
    await fireEvent.press(
      screen.getByTestId('event-sheet-backdrop', { includeHiddenElements: true }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape on the web and the back button on Android', async () => {
    const onClose = jest.fn();
    await renderSheet(launch, onClose);

    screen.getByTestId('event-sheet').props.onRequestClose();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('on wide screens is a panel beside the map, not a modal sheet', async () => {
    const onClose = jest.fn();
    await renderSheet(launch, onClose, true);

    expect(screen.getByTestId('event-sheet-side')).toBeTruthy();
    expect(screen.queryByTestId('event-sheet')).toBeNull();
    expect(screen.getByRole('header', { name: launchEvent.title })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tanca la fitxa' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('on wide screens shows nothing while no event is selected', async () => {
    await renderSheet(null, jest.fn(), true);

    expect(screen.queryByTestId('event-sheet-side')).toBeNull();
  });

  it('on wide screens takes the screen reader to the title when it opens', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation();

    await renderSheet(launch, jest.fn(), true);

    expect(send).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  it('on wide screens on the web gives the focus back to where it was once closed', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const marker = { focus: jest.fn() };
    const realDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { activeElement: marker, addEventListener: jest.fn(), removeEventListener: jest.fn() },
    });
    try {
      const { unmount } = await renderSheet(launch, jest.fn(), true);
      expect(marker.focus).not.toHaveBeenCalled();

      await unmount();

      expect(marker.focus).toHaveBeenCalledTimes(1);
    } finally {
      if (realDocument) Object.defineProperty(globalThis, 'document', realDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });

  it('on wide screens on the web gives the focus back to the last marker chosen', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const first = { focus: jest.fn() };
    const second = { focus: jest.fn() };
    const fakeDocument = {
      activeElement: first as unknown,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    const realDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
    const sheet = (event: ClassifiedEvent) => (
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <EventSheet event={event} onClose={jest.fn()} side />
      </SafeAreaProvider>
    );
    try {
      const { rerender, unmount } = await render(sheet(launch));
      // The panel stays open while another marker is chosen on the map.
      fakeDocument.activeElement = second;
      await rerender(sheet(eclipse));
      expect(first.focus).not.toHaveBeenCalled();

      await unmount();

      expect(second.focus).toHaveBeenCalledTimes(1);
      expect(first.focus).not.toHaveBeenCalled();
    } finally {
      if (realDocument) Object.defineProperty(globalThis, 'document', realDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });

  it('on wide screens closes with the back button, and stops listening once closed', async () => {
    const remove = jest.fn();
    let onBack: (() => unknown) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      onBack = handler as () => unknown;
      return { remove };
    });
    const onClose = jest.fn();
    const { unmount } = await renderSheet(launch, onClose, true);

    expect(onBack?.()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
