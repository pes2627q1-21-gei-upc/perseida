import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { AccessibilityInfo, BackHandler, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  launchEvent,
  lunarEvent,
  meteorShowerEvent,
  solarEvent,
} from '../../../../__mocks__/events';
import { myOuting, otherOuting } from '../../../../__mocks__/outings';
import i18n from '../../../shared/i18n';
import { colors } from '../../../shared/theme/colors';
import { type ClassifiedEvent, classifyEvents } from '../classifyEvents';
import { formatEventDateTime } from '../formatEvent';
import { EventSheet } from './EventSheet';

// SecureStore is native: an empty in-memory store, so the posts of the sheet have no session.
// The title of the event of an outing comes from the events of the map: here it is a given.
let mockEventTitle: string | undefined;
jest.mock('../../outings/hooks/useEventTitle', () => ({ useEventTitle: () => mockEventTitle }));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const { active, upcoming } = classifyEvents([meteorShowerEvent], [launchEvent, solarEvent]);
const [leonids] = active;
const [launch, eclipse] = upcoming;

async function renderSheet(
  event: ClassifiedEvent | null,
  onClose = jest.fn(),
  side = false,
  onShowOutings?: (eventId: string) => void,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <EventSheet event={event} onClose={onClose} side={side} onShowOutings={onShowOutings} />
      </SafeAreaProvider>
    </QueryClientProvider>,
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

  it('ends with the community posts of the event (TG-628 criterion 7)', async () => {
    await renderSheet(launch);

    expect(screen.getByRole('header', { name: 'Publicacions' })).toBeTruthy();
    expect(screen.getByLabelText('La teva publicació')).toBeTruthy();
  });

  it('has a button to the outings of the event that opens them (TG-629)', async () => {
    const onShowOutings = jest.fn();
    await renderSheet(launch, jest.fn(), false, onShowOutings);

    await fireEvent.press(screen.getByRole('button', { name: "Sortides d'aquest esdeveniment" }));

    expect(onShowOutings).toHaveBeenCalledWith(launch.id);
  });

  it('has no button to the outings when the screen gives no way to open them', async () => {
    await renderSheet(launch);

    expect(screen.queryByRole('button', { name: "Sortides d'aquest esdeveniment" })).toBeNull();
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

  it('at night lights up the close button while it is held, with the layer over the glass (TG-650)', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    await renderSheet(launch);
    const close = screen.getByRole('button', { name: 'Tanca la fitxa' });
    expect(close).toHaveStyle({ backgroundColor: 'transparent' });

    // While the finger is down (a long press holds it), the button shows the pressed layer.
    const holding = userEvent.setup().longPress(close, { duration: 400 });
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));

    expect(close).toHaveStyle({ backgroundColor: colors.nit.surface.onGlass });
    await holding;
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

  it('on wide screens the content fills the panel and scrolls, without a fixed maxHeight (TG-647)', async () => {
    await renderSheet(launch, jest.fn(), true);

    const [scroll] = screen.root!.queryAll((node) => node.type === 'RCTScrollView');
    const style = StyleSheet.flatten(scroll.props.style);
    expect(style.flex).toBe(1);
    expect(style.maxHeight).toBeUndefined();
  });

  it('on wide screens keeps the top and bottom safe areas plus the spacing of the panel (TG-647)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacy = { topInset: 80 };
    await render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={SAFE_AREA}>
          <EventSheet event={launch} onClose={jest.fn()} side {...legacy} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );

    const panel = StyleSheet.flatten(screen.getByTestId('event-sheet-side').props.style);
    expect(panel.paddingTop).toBe(47 + 16);
    expect(panel.paddingBottom).toBe(34 + 16);
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
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sheet = (event: ClassifiedEvent) => (
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={SAFE_AREA}>
          <EventSheet event={event} onClose={jest.fn()} side />
        </SafeAreaProvider>
      </QueryClientProvider>
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

// TG-646 criterion 3: the shell of the sheet (bottom sheet or side panel, Escape, focus, close
// button) shows an outing instead of an event.
describe('EventSheet with an outing (TG-646)', () => {
  async function renderOuting(
    outing: typeof myOuting | typeof otherOuting | null,
    { onClose = jest.fn(), side = false, onOpenOuting = jest.fn() } = {},
  ) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={SAFE_AREA}>
          <EventSheet
            event={null}
            outing={outing}
            onClose={onClose}
            side={side}
            onOpenOuting={onOpenOuting}
          />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    mockEventTitle = undefined;
  });

  it('shows nothing without event nor outing', async () => {
    await renderOuting(null);

    expect(screen.queryByRole('header')).toBeNull();
  });

  it('shows the title, the start and the end of the outing', async () => {
    await renderOuting(myOuting);

    expect(screen.getByRole('header', { name: myOuting.title })).toBeTruthy();
    expect(screen.getByText('Inici')).toBeTruthy();
    expect(screen.getByText(formatEventDateTime(myOuting.starts_at, i18n.language))).toBeTruthy();
    expect(screen.getByText('Fi')).toBeTruthy();
    expect(screen.getByText(formatEventDateTime(myOuting.ends_at, i18n.language))).toBeTruthy();
  });

  it('shows who organises it, or says it is an anonymous user', async () => {
    const view = await renderOuting(myOuting);
    expect(screen.getByText(myOuting.author.display_name)).toBeTruthy();
    await view.unmount();

    await renderOuting(otherOuting);
    expect(screen.getByText('Una usuària de Perseida')).toBeTruthy();
  });

  it('shows the title of the event it is linked to', async () => {
    mockEventTitle = meteorShowerEvent.title;

    await renderOuting(myOuting);

    expect(screen.getByText(meteorShowerEvent.title)).toBeTruthy();
  });

  it('names the linked event with its own text when its title is not known (TG-646)', async () => {
    mockEventTitle = undefined;

    await renderOuting(myOuting);

    const own = i18n.t('events.outings.linkedEvent');
    expect(own).not.toBe('events.outings.linkedEvent');
    expect(screen.getByText(own)).toBeTruthy();
    expect(i18n.t('outings.form.linkedEvent')).not.toBe(own);
    expect(screen.queryByText(i18n.t('outings.form.linkedEvent'))).toBeNull();
  });

  it('has a button to the page of the outing that gives its id', async () => {
    const onOpenOuting = jest.fn();
    await renderOuting(myOuting, { onOpenOuting });

    await fireEvent.press(screen.getByRole('button', { name: i18n.t('events.outings.open') }));

    expect(i18n.t('events.outings.open')).not.toBe('events.outings.open');
    expect(onOpenOuting).toHaveBeenCalledWith(myOuting.id);
  });

  it('has no event buttons nor community posts', async () => {
    await renderOuting(myOuting);

    expect(screen.queryByRole('button', { name: "Sortides d'aquest esdeveniment" })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Publicacions' })).toBeNull();
  });

  it('closes with its button and with the back gesture of the modal', async () => {
    const onClose = jest.fn();
    await renderOuting(myOuting, { onClose });

    await fireEvent.press(screen.getByRole('button', { name: 'Tanca la fitxa' }));
    screen.getByTestId('event-sheet').props.onRequestClose();

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('on wide screens is a side panel that closes with the back button', async () => {
    const onClose = jest.fn();
    let onBack: () => unknown = () => false;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
      onBack = handler as () => unknown;
      return { remove: jest.fn() };
    });

    await renderOuting(myOuting, { onClose, side: true });

    expect(screen.getByTestId('event-sheet-side')).toBeTruthy();
    expect(screen.getByRole('header', { name: myOuting.title })).toBeTruthy();
    expect(onBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
