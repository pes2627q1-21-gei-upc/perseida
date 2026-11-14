import { render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { colors } from '../../../shared/theme';
import { EventMap } from './EventMap';
import { buildLeafletHtml } from './leafletHtml';
import { markerPalette } from './markerIcon';
import type { MapMarker } from './mapTiles';

// The native WebView does not run under Jest: a plain View keeps its props for the assertions.
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native');
  return { WebView: View };
});

const MARKERS: MapMarker[] = [
  {
    id: 'e1',
    latitude: 28.5618,
    longitude: -80.577,
    label: 'Falcon 9 launch',
    category: 'launch',
    active: true,
  },
];
const LABEL = "Mapa d'esdeveniments";
// Jest runs the app in Catalan (jest.setup.js).
const ZOOM = { zoomIn: 'Apropa', zoomOut: 'Allunya' };

function message(data: string) {
  return { nativeEvent: { data } };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EventMap (mobile)', () => {
  it('renders the Leaflet page with the markers in the colours of the theme', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    // Jest's colour scheme is light, so the theme is `dia`; the mock of Reanimated reports no
    // reduced motion.
    const style = { palette: markerPalette(colors.dia), reduceMotion: false };
    const webView = screen.getByLabelText(LABEL);
    expect(webView.props.source).toEqual({ html: buildLeafletHtml(MARKERS, LABEL, style, ZOOM) });
    expect(webView.props.javaScriptEnabled).toBe(true);
    expect(webView.props.setSupportMultipleWindows).toBe(false);
    expect(webView.props.style).toEqual({ flex: 1, backgroundColor: colors.dia.map.background });
  });

  it('freezes the halo of active events when the system asks for reduced motion', async () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);

    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    const style = { palette: markerPalette(colors.dia), reduceMotion: true };
    expect(screen.getByLabelText(LABEL).props.source).toEqual({
      html: buildLeafletHtml(MARKERS, LABEL, style, ZOOM),
    });
  });

  it('reports the marker the user taps', async () => {
    const onSelect = jest.fn();
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={onSelect} />);

    screen.getByLabelText(LABEL).props.onMessage(message(JSON.stringify({ select: 'e1' })));

    expect(onSelect).toHaveBeenCalledWith('e1');
  });

  it.each(['not json', JSON.stringify({ select: 'unknown' }), JSON.stringify({ other: 1 })])(
    'ignores a message that is not a tap on a known marker: %s',
    async (data) => {
      const onSelect = jest.fn();
      await render(<EventMap markers={MARKERS} label={LABEL} onSelect={onSelect} />);

      screen.getByLabelText(LABEL).props.onMessage(message(data));

      expect(onSelect).not.toHaveBeenCalled();
    },
  );

  it('only loads the map page itself: https links open outside, anything else is blocked', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);
    const allow = screen.getByLabelText(LABEL).props.onShouldStartLoadWithRequest;

    expect(allow({ url: 'about:blank', isTopFrame: true })).toBe(true);
    expect(allow({ url: 'https://carto.com/attributions', isTopFrame: true })).toBe(false);
    expect(openURL).toHaveBeenCalledWith('https://carto.com/attributions');

    openURL.mockClear();
    expect(allow({ url: 'javascript:alert(1)', isTopFrame: true })).toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });
});
