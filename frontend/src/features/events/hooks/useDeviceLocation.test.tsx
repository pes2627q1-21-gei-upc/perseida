import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { useDeviceLocation } from './useDeviceLocation';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

const permission = jest.mocked(Location.requestForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);

function grant() {
  permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
}

function at(latitude: number, longitude: number) {
  return { coords: { latitude, longitude }, timestamp: 0 } as Location.LocationObject;
}

afterEach(() => jest.clearAllMocks());

describe('useDeviceLocation (TG-51, criterion 7)', () => {
  it('does not ask for the permission until the user wants it', async () => {
    const { result } = await renderHook(() => useDeviceLocation());

    expect(result.current.status).toBe('idle');
    expect(result.current.position).toBeNull();
    expect(permission).not.toHaveBeenCalled();
  });

  it('gives the position of the device when the permission is granted', async () => {
    grant();
    position.mockResolvedValue(at(41.3874, 2.1686));
    const { result } = await renderHook(() => useDeviceLocation());

    await act(() => result.current.request());

    expect(permission).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('granted');
    expect(result.current.position).toEqual({ latitude: 41.3874, longitude: 2.1686 });
  });

  it('is locating while the position comes', async () => {
    grant();
    let resolve!: (value: Location.LocationObject) => void;
    position.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result } = await renderHook(() => useDeviceLocation());

    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.request();
    });

    await waitFor(() => expect(result.current.status).toBe('locating'));
    await act(async () => {
      resolve(at(41.3874, 2.1686));
      await pending;
    });
    expect(result.current.status).toBe('granted');
  });

  it('is denied, without position, when the user refuses the permission', async () => {
    permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
    const { result } = await renderHook(() => useDeviceLocation());

    await act(() => result.current.request());

    expect(result.current.status).toBe('denied');
    expect(result.current.position).toBeNull();
    expect(position).not.toHaveBeenCalled();
  });

  it('is denied when the position cannot be read (location services off)', async () => {
    grant();
    position.mockRejectedValue(new Error('Location services are disabled'));
    const { result } = await renderHook(() => useDeviceLocation());

    await act(() => result.current.request());

    expect(result.current.status).toBe('denied');
    expect(result.current.position).toBeNull();
  });

  it('is denied when asking for the permission throws', async () => {
    permission.mockRejectedValue(new Error('no permission module'));
    const { result } = await renderHook(() => useDeviceLocation());

    await act(() => result.current.request());

    expect(result.current.status).toBe('denied');
  });
});
