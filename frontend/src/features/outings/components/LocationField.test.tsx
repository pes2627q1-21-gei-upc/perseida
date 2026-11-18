import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useState } from 'react';

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

  it('does not say in a text which place is chosen: the fields show it', async () => {
    await render(
      <LocationField value={{ latitude: 42.05, longitude: 0.73 }} onChange={jest.fn()} />,
    );

    expect(screen.queryByText(/Lloc triat/)).toBeNull();
  });

  describe('the latitude and longitude fields show the chosen place', () => {
    const latitude = (value: number) => formatCoordinate(value, 'ca');

    /** The parent keeps the value, as the form does: choosing changes what the field gets. */
    function Controlled({
      initial = null,
    }: {
      initial?: { latitude: number; longitude: number } | null;
    }) {
      const [value, setValue] = useState(initial);
      return <LocationField value={value} onChange={setValue} />;
    }

    it('are empty while there is no place', async () => {
      await render(<Controlled />);

      expect(screen.getByLabelText('Latitud').props.value).toBe('');
      expect(screen.getByLabelText('Longitud').props.value).toBe('');
    });

    it('are filled with the place the outing already has', async () => {
      await render(<Controlled initial={{ latitude: 42.05, longitude: 0.73 }} />);

      expect(screen.getByLabelText('Latitud').props.value).toBe(latitude(42.05));
      expect(screen.getByLabelText('Longitud').props.value).toBe(latitude(0.73));
    });

    it('are filled when the place under the reticle is chosen', async () => {
      await render(<Controlled />);
      await act(async () =>
        mockMapProps.onCameraChange({ latitude: 41.39, longitude: 2.17, zoom: 12 }),
      );

      await fireEvent.press(screen.getByRole('button', { name: 'Tria aquest lloc' }));

      expect(screen.getByLabelText('Latitud').props.value).toBe(latitude(41.39));
      expect(screen.getByLabelText('Longitud').props.value).toBe(latitude(2.17));
    });

    it('are filled when the location of the device is used', async () => {
      permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
      position.mockResolvedValue({
        coords: { latitude: 41.5, longitude: 2.2 },
      } as Location.LocationObject);
      await render(<Controlled />);

      await fireEvent.press(screen.getByRole('button', { name: 'Usa la meva ubicació' }));

      expect(screen.getByLabelText('Latitud').props.value).toBe(latitude(41.5));
      expect(screen.getByLabelText('Longitud').props.value).toBe(latitude(2.2));
    });

    it('are written in the same way once typed coordinates are chosen', async () => {
      await render(<Controlled />);
      await fireEvent.changeText(screen.getByLabelText('Latitud'), '41.5');
      await fireEvent.changeText(screen.getByLabelText('Longitud'), '2,2');

      await fireEvent.press(screen.getByRole('button', { name: 'Tria aquestes coordenades' }));

      expect(screen.getByLabelText('Latitud').props.value).toBe(latitude(41.5));
      expect(screen.getByLabelText('Longitud').props.value).toBe(latitude(2.2));
    });

    it('keep what was typed when the coordinates are not valid', async () => {
      await render(<Controlled />);
      await fireEvent.changeText(screen.getByLabelText('Latitud'), '91');
      await fireEvent.changeText(screen.getByLabelText('Longitud'), '2');

      await fireEvent.press(screen.getByRole('button', { name: 'Tria aquestes coordenades' }));

      expect(screen.getByLabelText('Latitud').props.value).toBe('91');
      expect(screen.getByLabelText('Longitud').props.value).toBe('2');
    });

    it('can still be typed in while a place is chosen', async () => {
      await render(<Controlled initial={{ latitude: 42.05, longitude: 0.73 }} />);

      await fireEvent.changeText(screen.getByLabelText('Latitud'), '10');

      expect(screen.getByLabelText('Latitud').props.value).toBe('10');
    });
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

  describe('coordinates', () => {
    async function typeCoordinates(latitude: string, longitude: string) {
      await fireEvent.changeText(screen.getByLabelText('Latitud'), latitude);
      await fireEvent.changeText(screen.getByLabelText('Longitud'), longitude);
      await fireEvent.press(screen.getByRole('button', { name: 'Tria aquestes coordenades' }));
    }

    it('has a field for the latitude and one for the longitude, with decimal keyboards', async () => {
      await render(<LocationField value={null} onChange={jest.fn()} />);

      expect(screen.getByLabelText('Latitud').props.keyboardType).toBe('numbers-and-punctuation');
      expect(screen.getByLabelText('Longitud').props.keyboardType).toBe('numbers-and-punctuation');
    });

    it('chooses the place of the coordinates and moves the map there', async () => {
      const onChange = jest.fn();
      await render(<LocationField value={null} onChange={onChange} />);

      await typeCoordinates('41,5', '2.2');

      expect(onChange).toHaveBeenCalledWith({ latitude: 41.5, longitude: 2.2 });
      expect(mockMapProps.start).toMatchObject({ latitude: 41.5, longitude: 2.2 });
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it.each([
      ['', ''],
      ['abc', '2'],
      ['91', '2'],
      ['41', '181'],
    ])('explains it and chooses nothing for %j, %j', async (latitude, longitude) => {
      const onChange = jest.fn();
      await render(<LocationField value={null} onChange={onChange} />);

      await typeCoordinates(latitude, longitude);

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        "La latitud ha d'estar entre −90 i 90, i la longitud entre −180 i 180.",
      );
    });

    it('clears the explanation once the coordinates are right', async () => {
      await render(<LocationField value={null} onChange={jest.fn()} />);

      await typeCoordinates('91', '2');
      expect(screen.getByRole('alert')).toBeOnTheScreen();
      await typeCoordinates('41', '2');

      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows the error of the field, already translated, as an alert', async () => {
    await render(<LocationField value={null} onChange={jest.fn()} error="Tria on us trobareu." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Tria on us trobareu.');
  });
});
