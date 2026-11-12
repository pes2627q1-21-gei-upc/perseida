import { render, screen } from '@testing-library/react-native';

import { colors } from '../../../shared/theme';
import { EventMap } from './EventMap.web';
import { MARKER_SIZE, markerCss, markerIconHtml, markerPalette } from './markerIcon';
import { BASE_MAP_ATTRIBUTION, BASE_MAP_TILES, type MapMarker } from './mapTiles';

const mockFitBounds = jest.fn();

// Leaflet needs a real DOM, which Jest's React Native environment does not have: each
// react-leaflet component becomes a View that keeps its props for the assertions.
jest.mock('react-leaflet', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    MapContainer: (props: object) => <MockView testID="map" {...props} />,
    TileLayer: (props: object) => <MockView testID="tiles" {...props} />,
    Marker: (props: object) => <MockView testID="marker" {...props} />,
    useMap: () => ({ fitBounds: mockFitBounds }),
  };
});
// divIcon only builds the options object, so the mock hands them back as they are.
jest.mock('leaflet', () => ({ divIcon: (options: object) => ({ divIcon: options }) }));
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });

const MARKERS: MapMarker[] = [
  {
    id: 'e1',
    latitude: 28.5618,
    longitude: -80.577,
    label: 'Falcon 9 launch',
    category: 'launch',
    active: true,
  },
  {
    id: 'e2',
    latitude: 41.39,
    longitude: 2.17,
    label: 'Barcelona event',
    category: 'lunar',
    active: false,
  },
];
const LABEL = "Mapa d'esdeveniments";

afterEach(() => {
  mockFitBounds.mockClear();
});

describe('EventMap (web)', () => {
  it('draws the base map tiles with their attribution', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    const tiles = screen.getByTestId('tiles');
    expect(tiles.props.url).toBe(BASE_MAP_TILES);
    expect(tiles.props.attribution).toBe(BASE_MAP_ATTRIBUTION);
  });

  it('labels the map region for screen readers', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    // MapContainer passes its props to Leaflet, not to the DOM: a wrapping region carries the label.
    expect(screen.root!.props.role).toBe('region');
    expect(screen.root!.props['aria-label']).toBe(LABEL);
  });

  it('places one marker per event, with an accessible label', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    const markers = screen.getAllByTestId('marker');
    expect(markers.map((m) => m.props.position)).toEqual([
      [28.5618, -80.577],
      [41.39, 2.17],
    ]);
    expect(markers.map((m) => m.props.title)).toEqual(['Falcon 9 launch', 'Barcelona event']);
    expect(markers.map((m) => m.props.keyboard)).toEqual([true, true]);
  });

  it('draws each marker as the glass orb of its category instead of the default pin', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    const icons = screen.getAllByTestId('marker').map((m) => m.props.icon.divIcon);
    expect(icons.map((icon) => icon.html)).toEqual(MARKERS.map((m) => markerIconHtml(m)));
    expect(icons[0].iconSize).toEqual([MARKER_SIZE, MARKER_SIZE]);
    expect(icons[0].className).toBe('pm-marker');
  });

  it('adds the orb styles in the colours of the theme', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    const css = markerCss(markerPalette(colors.dia), { reduceMotion: false });
    expect(screen.root!.findByType('style' as never).props.children).toBe(css);
  });

  it('fits the map to the markers', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    expect(mockFitBounds).toHaveBeenCalledWith(
      [
        [28.5618, -80.577],
        [41.39, 2.17],
      ],
      { padding: [40, 40], maxZoom: 6 },
    );
  });

  it('keeps the whole world in view when there are no markers', async () => {
    await render(<EventMap markers={[]} label={LABEL} onSelect={jest.fn()} />);

    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  it('reports the marker the user clicks or activates with the keyboard', async () => {
    const onSelect = jest.fn();
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={onSelect} />);

    screen.getAllByTestId('marker')[1].props.eventHandlers.click();

    expect(onSelect).toHaveBeenCalledWith('e2');
  });
});
