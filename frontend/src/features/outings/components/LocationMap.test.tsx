import { render, screen } from '@testing-library/react-native';

import { colors } from '../../../shared/theme';
import { LocationMap } from './LocationMap';
import { buildPickerHtml } from './pickerHtml';

// The native WebView does not run under Jest: a plain View keeps its props for the assertions.
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native');
  return { WebView: View };
});

const LABEL = 'Mapa per triar el lloc';
const START = { latitude: 41.4, longitude: 2.1, zoom: 8 };
// Jest runs the app in Catalan (jest.setup.js).
const ZOOM = { zoomIn: 'Apropa', zoomOut: 'Allunya' };

function message(data: string) {
  return { nativeEvent: { data } };
}

describe('LocationMap (mobile)', () => {
  it('renders the page of the picker in the colours of the theme', async () => {
    await render(<LocationMap start={START} label={LABEL} onCameraChange={jest.fn()} />);

    const webView = screen.getByLabelText(LABEL);
    const html = buildPickerHtml({
      camera: START,
      label: LABEL,
      background: colors.dia.map.background,
      zoom: ZOOM,
    });
    expect(webView.props.source).toEqual({ html });
    expect(webView.props.javaScriptEnabled).toBe(true);
    expect(webView.props.setSupportMultipleWindows).toBe(false);
    expect(webView.props.style).toEqual({ flex: 1, backgroundColor: colors.dia.map.background });
  });

  it('reports the camera the map sends after a move', async () => {
    const onCameraChange = jest.fn();
    await render(<LocationMap start={START} label={LABEL} onCameraChange={onCameraChange} />);
    const view = { latitude: 42.05, longitude: 0.73, zoom: 12 };

    screen.getByLabelText(LABEL).props.onMessage(message(JSON.stringify({ view })));

    expect(onCameraChange).toHaveBeenCalledWith(view);
  });

  it.each([
    'not json',
    JSON.stringify({ other: 1 }),
    JSON.stringify({ view: { latitude: 91, longitude: 0, zoom: 2 } }),
    JSON.stringify({ view: { latitude: 0, longitude: 0, zoom: 99 } }),
  ])('ignores a message that is not a real camera: %s', async (data) => {
    const onCameraChange = jest.fn();
    await render(<LocationMap start={START} label={LABEL} onCameraChange={onCameraChange} />);

    screen.getByLabelText(LABEL).props.onMessage(message(data));

    expect(onCameraChange).not.toHaveBeenCalled();
  });

  it('opens the page again at the new start when it changes, and only then', async () => {
    const onCameraChange = jest.fn();
    const { rerender } = await render(
      <LocationMap start={START} label={LABEL} onCameraChange={onCameraChange} />,
    );
    const first = screen.getByLabelText(LABEL).props.source;

    await rerender(<LocationMap start={START} label={LABEL} onCameraChange={jest.fn()} />);
    expect(screen.getByLabelText(LABEL).props.source).toBe(first);

    const moved = { latitude: 1, longitude: 2, zoom: 14 };
    await rerender(<LocationMap start={moved} label={LABEL} onCameraChange={onCameraChange} />);
    expect(screen.getByLabelText(LABEL).props.source.html).toContain('.setView([1,2], 14)');
  });

  it('blocks any navigation away from the map page', async () => {
    await render(<LocationMap start={START} label={LABEL} onCameraChange={jest.fn()} />);
    const { onShouldStartLoadWithRequest } = screen.getByLabelText(LABEL).props;

    expect(onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
    expect(onShouldStartLoadWithRequest({ url: 'https://example.com/' })).toBe(false);
  });
});
