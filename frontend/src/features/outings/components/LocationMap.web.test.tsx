import { render, screen } from '@testing-library/react-native';

import { colors } from '../../../shared/theme';
import { BASE_MAP_ATTRIBUTION, BASE_MAP_TILES } from '../../../shared/map/mapTiles';
import { LocationMap } from './LocationMap.web';

const mockSetView = jest.fn();
let mockHandlers: { moveend?: () => void } = {};
const mockMap = {
  setView: mockSetView,
  // A map dragged around the world reports a longitude beyond 180: `wrap` brings it back.
  getCenter: () => ({ lat: 42.05, lng: 360.73, wrap: () => ({ lat: 42.05, lng: 0.73 }) }),
  getZoom: () => 12,
};

// Leaflet needs a real DOM, which Jest's React Native environment does not have: each
// react-leaflet component becomes a View that keeps its props for the assertions.
jest.mock('react-leaflet', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    MapContainer: (props: object) => <MockView testID="map" {...props} />,
    TileLayer: (props: object) => <MockView testID="tiles" {...props} />,
    ZoomControl: (props: object) => <MockView testID="zoom" {...props} />,
    AttributionControl: (props: object) => <MockView testID="attribution" {...props} />,
    useMap: () => mockMap,
    useMapEvents: (handlers: { moveend?: () => void }) => {
      mockHandlers = handlers;
      return mockMap;
    },
  };
});
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });

const LABEL = 'Mapa per triar el lloc';
const START = { latitude: 41.4, longitude: 2.1, zoom: 8 };

afterEach(() => {
  mockSetView.mockClear();
  mockHandlers = {};
});

describe('LocationMap (web)', () => {
  it('draws the base map tiles with their attribution', async () => {
    await render(<LocationMap start={START} label={LABEL} onCameraChange={jest.fn()} />);

    expect(screen.getByTestId('tiles').props.url).toBe(BASE_MAP_TILES);
    expect(screen.getByTestId('tiles').props.attribution).toBe(BASE_MAP_ATTRIBUTION);
  });

  it('opens at the start, with the map background of the theme', async () => {
    await render(<LocationMap start={START} label={LABEL} onCameraChange={jest.fn()} />);

    const map = screen.getByTestId('map');
    expect(map.props.center).toEqual([41.4, 2.1]);
    expect(map.props.zoom).toBe(8);
    expect(map.props.style.background).toBe(colors.dia.map.background);
  });

  it('labels the map region for screen readers', async () => {
    await render(<LocationMap start={START} label={LABEL} onCameraChange={jest.fn()} />);

    expect(screen.root!.props.role).toBe('region');
    expect(screen.root!.props['aria-label']).toBe(LABEL);
  });

  it('gives the zoom buttons titles in the language of the app', async () => {
    await render(<LocationMap start={START} label={LABEL} onCameraChange={jest.fn()} />);

    expect(screen.getByTestId('zoom').props).toMatchObject({
      zoomInTitle: 'Apropa',
      zoomOutTitle: 'Allunya',
    });
  });

  it('reports the centre and zoom after every move', async () => {
    const onCameraChange = jest.fn();
    await render(<LocationMap start={START} label={LABEL} onCameraChange={onCameraChange} />);

    mockHandlers.moveend?.();

    expect(onCameraChange).toHaveBeenCalledWith({ latitude: 42.05, longitude: 0.73, zoom: 12 });
  });

  it('moves the map when the start changes, and not on the first render', async () => {
    const { rerender } = await render(
      <LocationMap start={START} label={LABEL} onCameraChange={jest.fn()} />,
    );
    expect(mockSetView).not.toHaveBeenCalled();

    await rerender(
      <LocationMap
        start={{ latitude: 1, longitude: 2, zoom: 14 }}
        label={LABEL}
        onCameraChange={jest.fn()}
      />,
    );

    expect(mockSetView).toHaveBeenCalledWith([1, 2], 14);
  });
});
