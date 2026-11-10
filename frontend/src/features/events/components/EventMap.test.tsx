import { render, screen } from '@testing-library/react-native';

import { EventMap } from './EventMap';
import { buildLeafletHtml } from './leafletHtml';

// The native WebView does not run under Jest: a plain View keeps its props for the assertions.
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native');
  return { WebView: View };
});

const MARKERS = [{ id: 'e1', latitude: 28.5618, longitude: -80.577, label: 'Falcon 9 launch' }];
const LABEL = "Mapa d'esdeveniments";

function message(data: string) {
  return { nativeEvent: { data } };
}

describe('EventMap (mobile)', () => {
  it('renders the Leaflet page with the markers inside a WebView', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    const webView = screen.getByLabelText(LABEL);
    expect(webView.props.source).toEqual({ html: buildLeafletHtml(MARKERS, LABEL) });
    expect(webView.props.javaScriptEnabled).toBe(true);
    expect(webView.props.setSupportMultipleWindows).toBe(false);
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

  it('only loads the map page itself: any link opens outside or is blocked', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);
    const allow = screen.getByLabelText(LABEL).props.onShouldStartLoadWithRequest;

    expect(allow({ url: 'about:blank', isTopFrame: true })).toBe(true);
    expect(allow({ url: 'https://carto.com/attributions', isTopFrame: true })).toBe(false);
    expect(allow({ url: 'javascript:alert(1)', isTopFrame: true })).toBe(false);
  });
});
