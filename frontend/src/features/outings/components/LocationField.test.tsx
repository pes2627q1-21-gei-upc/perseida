import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { type ReactElement, useState } from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { isOnGlass } from '../../../../__mocks__/onGlass';
import { otherSpace, spotwiseLibrary, unvotedCafe } from '../../../../__mocks__/meetingPoints';
import i18n from '../../../shared/i18n';
import { saveTokens } from '../../auth/tokenStorage';
import type { MeetingPoint } from '../../meeting-points/api/meetingPoints';
import { formatCoordinate } from '../formatOuting';
import { LocationField } from './LocationField';

// SecureStore is native: an in-memory store stands in for the device keychain (TG-352).
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

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
  getForegroundPermissionsAsync: jest.fn(),
}));

const permission = jest.mocked(Location.requestForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);
const currentPermission = jest.mocked(Location.getForegroundPermissionsAsync);

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

// TG-352 criterion 7: creating or editing an outing, the watch party places near the person,
// and choosing one makes its coordinates the place of the outing.
describe('LocationField recommended places (TG-352, criterion 7)', () => {
  /** Where the person is: synthetic coordinates in Barcelona. */
  const DEVICE = { latitude: 41.4036, longitude: 2.1744 };
  const SAFE_AREA = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };
  /** Six places: only the first five are offered. Synthetic data. */
  const sixPoints: MeetingPoint[] = [
    spotwiseLibrary,
    unvotedCafe,
    otherSpace,
    {
      ...unvotedCafe,
      id: 15,
      name: "Bar d'exemple",
      location: { latitude: 41.42, longitude: 2.19 },
    },
    {
      ...otherSpace,
      id: 16,
      name: "Sala d'exemple",
      location: { latitude: 41.43, longitude: 2.2 },
    },
    {
      ...spotwiseLibrary,
      id: 17,
      name: "Ateneu d'exemple",
      location: { latitude: 41.44, longitude: 2.21 },
    },
  ];
  const recommend = () => i18n.t('outings.picker.recommend');
  const chooseName = (point: MeetingPoint) =>
    new RegExp(`^${escape(i18n.t('meetingPoints.choose', { name: point.name }))}`);

  let client: QueryClient;
  let fetchSpy: jest.SpyInstance;
  let meetingPoints: () => Response | Promise<Response>;

  function escape(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** The query strings of the requests for meeting points, in order. */
  function pointRequests(): URLSearchParams[] {
    return fetchSpy.mock.calls
      .map(([input]) => new URL((input as Request).url))
      .filter((url) => url.pathname === '/api/meeting-points')
      .map((url) => url.searchParams);
  }

  function grantAt(latitude: number, longitude: number) {
    permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
    position.mockResolvedValue({ coords: { latitude, longitude } } as Location.LocationObject);
  }

  /** The providers the form has in the app: the queries and the safe areas. */
  function withProviders(element: ReactElement) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={client}>{element}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }

  async function renderField(onChange = jest.fn()) {
    await render(withProviders(<LocationField value={null} onChange={onChange} />));
    return onChange;
  }

  beforeEach(async () => {
    client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    meetingPoints = () => jsonResponse(sixPoints);
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const { pathname } = new URL((input as Request).url);
      if (pathname === '/api/meeting-points') return meetingPoints();
      throw new Error(`unexpected request to ${pathname}`);
    });
  });

  afterEach(() => {
    client.clear();
    // The fetch of the API and, where a test listens to it, AppState.
    jest.restoreAllMocks();
  });

  it('has a button for it, with its own text, that asks nothing until it is pressed', async () => {
    await renderField();

    expect(recommend()).not.toBe('outings.picker.recommend');
    expect(screen.getByRole('button', { name: recommend() })).toBeTruthy();
    expect(permission).not.toHaveBeenCalled();
    expect(pointRequests()).toEqual([]);
  });

  it('asks for the location and shows the first five watch party places around the person', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    for (const point of sixPoints.slice(0, 5)) {
      expect(await screen.findByRole('button', { name: chooseName(point) })).toBeTruthy();
    }
    expect(screen.queryByText(sixPoints[5].name)).toBeNull();
    expect(permission).toHaveBeenCalledTimes(1);
    expect(pointRequests()).toHaveLength(1);
    const [search] = pointRequests();
    expect(search.get('profile')).toBe('watch_party');
    expect(Number(search.get('lat'))).toBe(DEVICE.latitude);
    expect(Number(search.get('lon'))).toBe(DEVICE.longitude);
  });

  it('does not choose the location of the person by itself', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    const onChange = await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));
    await screen.findByRole('button', { name: chooseName(spotwiseLibrary) });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('chooses only the coordinates of the place and moves the map there', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    const onChange = await renderField();
    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    await fireEvent.press(await screen.findByRole('button', { name: chooseName(unvotedCafe) }));

    expect(onChange).toHaveBeenCalledTimes(1);
    // Only the coordinates: neither the name nor the address of the place.
    expect(onChange.mock.calls[0][0]).toEqual({
      latitude: unvotedCafe.location.latitude,
      longitude: unvotedCafe.location.longitude,
    });
    expect(mockMapProps.start).toMatchObject(unvotedCafe.location);
  });

  it('fills the latitude and longitude fields with the place chosen', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    function Controlled() {
      const [value, setValue] = useState<{ latitude: number; longitude: number } | null>(null);
      return <LocationField value={value} onChange={setValue} />;
    }
    await render(withProviders(<Controlled />));
    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    await fireEvent.press(await screen.findByRole('button', { name: chooseName(otherSpace) }));

    expect(screen.getByLabelText('Latitud').props.value).toBe(
      formatCoordinate(otherSpace.location.latitude, 'ca'),
    );
    expect(screen.getByLabelText('Longitud').props.value).toBe(
      formatCoordinate(otherSpace.location.longitude, 'ca'),
    );
  });

  it('replaces the place the outing already has when editing it', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    const existing = { latitude: 42.05, longitude: 0.73 };
    const onChange = jest.fn();
    function Controlled() {
      const [value, setValue] = useState<{ latitude: number; longitude: number } | null>(existing);
      return (
        <LocationField
          value={value}
          onChange={(place) => {
            onChange(place);
            setValue(place);
          }}
        />
      );
    }
    await render(withProviders(<Controlled />));
    expect(screen.getByLabelText('Latitud').props.value).toBe(
      formatCoordinate(existing.latitude, 'ca'),
    );
    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    await fireEvent.press(await screen.findByRole('button', { name: chooseName(unvotedCafe) }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      latitude: unvotedCafe.location.latitude,
      longitude: unvotedCafe.location.longitude,
    });
    expect(screen.getByLabelText('Latitud').props.value).toBe(
      formatCoordinate(unvotedCafe.location.latitude, 'ca'),
    );
    expect(screen.getByLabelText('Longitud').props.value).toBe(
      formatCoordinate(unvotedCafe.location.longitude, 'ca'),
    );
    expect(mockMapProps.start).toMatchObject(unvotedCafe.location);
  });

  it('explains it and asks the API nothing when the person denies the location', async () => {
    permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
    const onChange = await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    // The same text as «Use my location»: the place can still be chosen on the map.
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('outings.picker.denied'));
    expect(position).not.toHaveBeenCalled();
    expect(pointRequests()).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText(spotwiseLibrary.name)).toBeNull();
  });

  it('explains it and asks the API nothing when the device cannot find the location', async () => {
    permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
    position.mockRejectedValue(new Error('Location services are disabled'));
    const onChange = await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(pointRequests()).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the message of unavailability when Spotwise does not answer', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    meetingPoints = () => problemResponse(503, 'MEETING_POINTS_UNAVAILABLE');
    const onChange = await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Ara no podem recomanar locals. Torna-ho a provar d'aquí a una estona.",
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says it is locating while the position comes', async () => {
    permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
    position.mockReturnValue(new Promise(() => undefined));
    await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    expect(await screen.findByLabelText(i18n.t('meetingPoints.location.locating'))).toBeTruthy();
    expect(screen.queryByLabelText(i18n.t('meetingPoints.loading'))).toBeNull();
  });

  it('draws the spinner of the places on glass, not straight on the sky (TG-658)', async () => {
    permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
    position.mockReturnValue(new Promise(() => undefined));
    await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    const spinner = await screen.findByLabelText(i18n.t('meetingPoints.location.locating'));
    expect(isOnGlass(spinner)).toBe(true);
  });

  it('says the places are loading once the position is here and the API answers', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    meetingPoints = () => new Promise(() => undefined);
    await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    expect(await screen.findByLabelText(i18n.t('meetingPoints.loading'))).toBeTruthy();
    expect(screen.queryByLabelText(i18n.t('meetingPoints.location.locating'))).toBeNull();
  });

  it('says there are no places nearby when the API finds none', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    meetingPoints = () => jsonResponse([]);
    await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    expect(await screen.findByText(i18n.t('meetingPoints.empty'))).toBeTruthy();
    expect(screen.queryByLabelText(i18n.t('meetingPoints.list.label'))).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('announcement of no places nearby (WCAG 4.1.3)', () => {
    /**
     * The announce of AccessibilityInfo is already a jest.fn() of the setup: spyOn gives back that
     * same mock and restoreAllMocks does not empty its calls, so they are cleared here.
     */
    function announceSpy() {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announce.mockClear();
      return announce;
    }

    beforeEach(() => {
      grantAt(DEVICE.latitude, DEVICE.longitude);
      meetingPoints = () => jsonResponse([]);
    });

    it('reads it in a polite live region', async () => {
      await renderField();

      await fireEvent.press(screen.getByRole('button', { name: recommend() }));

      expect(await screen.findByText(i18n.t('meetingPoints.empty'))).toHaveProp(
        'accessibilityLiveRegion',
        'polite',
      );
    });

    it('announces it on iOS', async () => {
      // jest-expo runs as iOS, where a status is announced explicitly.
      const announce = announceSpy();
      await renderField();

      await fireEvent.press(screen.getByRole('button', { name: recommend() }));
      await screen.findByText(i18n.t('meetingPoints.empty'));

      expect(announce).toHaveBeenCalledWith(i18n.t('meetingPoints.empty'));
    });

    it.each(['android', 'web'] as const)(
      'does not announce it explicitly on %s: the live region reads it',
      async (os) => {
        jest.replaceProperty(Platform, 'OS', os);
        const announce = announceSpy();
        await renderField();

        await fireEvent.press(screen.getByRole('button', { name: recommend() }));
        await screen.findByText(i18n.t('meetingPoints.empty'));

        expect(announce).not.toHaveBeenCalledWith(i18n.t('meetingPoints.empty'));
      },
    );

    it('does not announce it while there are places', async () => {
      meetingPoints = () => jsonResponse([spotwiseLibrary]);
      const announce = announceSpy();
      await renderField();

      await fireEvent.press(screen.getByRole('button', { name: recommend() }));
      await screen.findByRole('button', { name: chooseName(spotwiseLibrary) });

      expect(announce).not.toHaveBeenCalledWith(i18n.t('meetingPoints.empty'));
    });
  });

  it('gives the places as a named list', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    await renderField();

    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    // A list is a container, not an accessibility element, so it is found by its label.
    const list = await screen.findByLabelText(i18n.t('meetingPoints.list.label'));
    expect(list.props.accessibilityRole).toBe('list');
    expect(screen.queryByText(i18n.t('meetingPoints.empty'))).toBeNull();
  });

  it('hides the places once one is chosen', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    await renderField();
    await fireEvent.press(screen.getByRole('button', { name: recommend() }));

    await fireEvent.press(await screen.findByRole('button', { name: chooseName(unvotedCafe) }));

    expect(screen.queryByLabelText(i18n.t('meetingPoints.list.label'))).toBeNull();
    expect(screen.queryByRole('button', { name: chooseName(spotwiseLibrary) })).toBeNull();
  });

  it('asks for the location again each time the button is pressed', async () => {
    grantAt(DEVICE.latitude, DEVICE.longitude);
    await renderField();
    const button = screen.getByRole('button', { name: recommend() });
    await fireEvent.press(button);
    await screen.findByRole('button', { name: chooseName(spotwiseLibrary) });

    await fireEvent.press(button);

    await waitFor(() => expect(permission).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: chooseName(spotwiseLibrary) })).toBeTruthy();
  });

  it('asks for the location again by itself when the permission is given in the settings', async () => {
    const appStateListeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    grantAt(DEVICE.latitude, DEVICE.longitude);
    permission.mockResolvedValueOnce({ status: 'denied' } as Location.LocationPermissionResponse);
    await renderField();
    await fireEvent.press(screen.getByRole('button', { name: recommend() }));
    await screen.findByRole('alert');

    // The person gives the permission in the settings and comes back to the app.
    currentPermission.mockResolvedValue({
      status: 'granted',
    } as Location.LocationPermissionResponse);
    await act(async () => {
      for (const listener of appStateListeners) listener('active');
    });

    expect(await screen.findByRole('button', { name: chooseName(spotwiseLibrary) })).toBeTruthy();
    expect(permission).toHaveBeenCalledTimes(2);
  });
});
