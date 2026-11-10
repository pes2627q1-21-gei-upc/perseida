import { render, screen } from '@testing-library/react-native';

import { EventMap } from './EventMap.web';
import { CARTO_DARK_ATTRIBUTION, CARTO_DARK_TILES } from './mapTiles';

// Leaflet needs a real DOM, which Jest's React Native environment does not have: each
// react-leaflet component becomes a View that keeps its props for the assertions.
jest.mock('react-leaflet', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    MapContainer: (props: object) => <MockView testID="map" {...props} />,
    TileLayer: (props: object) => <MockView testID="tiles" {...props} />,
    Marker: (props: object) => <MockView testID="marker" {...props} />,
  };
});
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });

const MARKERS = [
  { id: 'e1', latitude: 28.5618, longitude: -80.577, label: 'Falcon 9 launch' },
  { id: 'e2', latitude: 41.39, longitude: 2.17, label: 'Barcelona event' },
];
const LABEL = "Mapa d'esdeveniments";

describe('EventMap (web)', () => {
  it('draws the CARTO Dark Matter tiles with their attribution', async () => {
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={jest.fn()} />);

    const tiles = screen.getByTestId('tiles');
    expect(tiles.props.url).toBe(CARTO_DARK_TILES);
    expect(tiles.props.attribution).toBe(CARTO_DARK_ATTRIBUTION);
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
    expect(markers.map((m) => m.props.alt)).toEqual(['Falcon 9 launch', 'Barcelona event']);
  });

  it('reports the marker the user clicks or activates with the keyboard', async () => {
    const onSelect = jest.fn();
    await render(<EventMap markers={MARKERS} label={LABEL} onSelect={onSelect} />);

    screen.getAllByTestId('marker')[1].props.eventHandlers.click();

    expect(onSelect).toHaveBeenCalledWith('e2');
  });
});
