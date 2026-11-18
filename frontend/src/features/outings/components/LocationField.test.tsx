import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { formatCoordinate } from '../formatOuting';
import { LocationField } from './LocationField';

let mockMapProps: {
  start: { latitude: number; longitude: number; zoom: number };
  label: string;
  onCameraChange: (camera: { latitude: number; longitude: number; zoom: number }) => void;
};
jest.mock('./LocationMap', () => ({
  LocationMap: (props: typeof mockMapProps) => {
    mockMapProps = props;
    return null;
  },
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const permission = jest.mocked(Location.requestForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);

afterEach(() => jest.clearAllMocks());

describe('LocationField', () => {
  it('gives the map its accessible name and the instructions', async () => {
    await render(<LocationField value={null} onChange={jest.fn()} />);

    expect(mockMapProps.label).toBe('Mapa per triar el lloc');
    expect(screen.getByText('Mou el mapa fins que la mira quedi sobre el lloc.')).toBeTruthy();
  });

  it('opens the map at the whole world when there is no location yet', async () => {
    await render(<LocationField value={null} onChange={jest.fn()} />);

    expect(mockMapProps.start.zoom).toBeLessThanOrEqual(3);
  });

  it('opens at the current location when editing', async () => {
    await render(
      <LocationField value={{ latitude: 42.05, longitude: 0.73 }} onChange={jest.fn()} />,
    );

    expect(mockMapProps.start).toMatchObject({ latitude: 42.05, longitude: 0.73 });
    expect(mockMapProps.start.zoom).toBeGreaterThan(8);
  });

  it('chooses the place under the reticle: the centre of the map', async () => {
    const onChange = jest.fn();
    await render(<LocationField value={null} onChange={onChange} />);

    await act(async () =>
      mockMapProps.onCameraChange({ latitude: 41.39, longitude: 2.17, zoom: 12 }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Tria aquest lloc' }));

    expect(onChange).toHaveBeenCalledWith({ latitude: 41.39, longitude: 2.17 });
  });

  it('says which place is chosen', async () => {
    await render(
      <LocationField value={{ latitude: 42.05, longitude: 0.73 }} onChange={jest.fn()} />,
    );

    const latitude = formatCoordinate(42.05, 'ca');
    const longitude = formatCoordinate(0.73, 'ca');
    expect(screen.getByText(`Lloc triat: ${latitude}, ${longitude}`)).toBeTruthy();
  });

  it('says nothing is chosen yet when there is no value', async () => {
    await render(<LocationField value={null} onChange={jest.fn()} />);

    expect(screen.queryByText(/Lloc triat/)).toBeNull();
  });

  describe('my location', () => {
    it('chooses it and moves the map there when the person allows it', async () => {
      permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
      position.mockResolvedValue({
        coords: { latitude: 41.5, longitude: 2.2 },
      } as Location.LocationObject);
      const onChange = jest.fn();
      await render(<LocationField value={null} onChange={onChange} />);

      await fireEvent.press(screen.getByRole('button', { name: 'Usa la meva ubicació' }));

      expect(onChange).toHaveBeenCalledWith({ latitude: 41.5, longitude: 2.2 });
      expect(mockMapProps.start).toMatchObject({ latitude: 41.5, longitude: 2.2 });
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('explains it and chooses nothing when the person denies it', async () => {
      permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
      const onChange = jest.fn();
      await render(<LocationField value={null} onChange={onChange} />);

      await fireEvent.press(screen.getByRole('button', { name: 'Usa la meva ubicació' }));

      expect(onChange).not.toHaveBeenCalled();
      expect(position).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No hem pogut obtenir la teva ubicació. Mou el mapa per triar el lloc.',
      );
    });

    it('explains it when the device cannot find the location', async () => {
      permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
      position.mockRejectedValue(new Error('unavailable'));
      const onChange = jest.fn();
      await render(<LocationField value={null} onChange={onChange} />);

      await fireEvent.press(screen.getByRole('button', { name: 'Usa la meva ubicació' }));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('clears the explanation after a new try that works', async () => {
      permission.mockResolvedValueOnce({
        status: 'denied',
      } as Location.LocationPermissionResponse);
      permission.mockResolvedValueOnce({
        status: 'granted',
      } as Location.LocationPermissionResponse);
      position.mockResolvedValue({
        coords: { latitude: 1, longitude: 2 },
      } as Location.LocationObject);
      await render(<LocationField value={null} onChange={jest.fn()} />);
      const button = screen.getByRole('button', { name: 'Usa la meva ubicació' });

      await fireEvent.press(button);
      expect(screen.getByRole('alert')).toBeTruthy();
      await fireEvent.press(button);

      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows the error of the field, already translated, as an alert', async () => {
    await render(<LocationField value={null} onChange={jest.fn()} error="Tria on us trobareu." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Tria on us trobareu.');
  });
});
