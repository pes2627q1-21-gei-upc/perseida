import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';

import { useDeviceLocation } from './useDeviceLocation';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
}));

const permission = jest.mocked(Location.requestForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);
const currentPermission = jest.mocked(Location.getForegroundPermissionsAsync);

/** Listeners of AppState 'change', so a test can bring the app back to the foreground. */
let appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(() => {
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

async function backToForeground() {
  await act(async () => {
    for (const listener of appStateListeners) listener('active');
  });
}

function grant() {
  permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
}

function at(latitude: number, longitude: number) {
  return { coords: { latitude, longitude }, timestamp: 0 } as Location.LocationObject;
}

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

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

  it('is unavailable, not denied, when the permission is granted but the position cannot be read', async () => {
    grant();
    position.mockRejectedValue(new Error('Location services are disabled'));
    const { result } = await renderHook(() => useDeviceLocation());

    await act(() => result.current.request());

    expect(result.current.status).toBe('unavailable');
    expect(result.current.position).toBeNull();
  });

  it('tries again from unavailable when asked again', async () => {
    grant();
    position.mockRejectedValueOnce(new Error('Location services are disabled'));
    position.mockResolvedValueOnce(at(41.3874, 2.1686));
    const { result } = await renderHook(() => useDeviceLocation());
    await act(() => result.current.request());
    expect(result.current.status).toBe('unavailable');

    await act(() => result.current.request());

    expect(result.current.status).toBe('granted');
    expect(result.current.position).toEqual({ latitude: 41.3874, longitude: 2.1686 });
  });

  it('is denied when asking for the permission throws', async () => {
    permission.mockRejectedValue(new Error('no permission module'));
    const { result } = await renderHook(() => useDeviceLocation());

    await act(() => result.current.request());

    expect(result.current.status).toBe('denied');
  });

  describe('back to the foreground (the user may have changed the permission in the settings)', () => {
    async function deniedHook() {
      permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
      const hook = await renderHook(() => useDeviceLocation());
      await act(() => hook.result.current.request());
      expect(hook.result.current.status).toBe('denied');
      return hook;
    }

    it('goes back to idle when the permission is granted now', async () => {
      const { result } = await deniedHook();
      currentPermission.mockResolvedValue({
        status: 'granted',
      } as Location.LocationPermissionResponse);

      await backToForeground();

      await waitFor(() => expect(result.current.status).toBe('idle'));
      expect(currentPermission).toHaveBeenCalledTimes(1);
      // Checking does not ask again: no system dialog when the app comes back.
      expect(permission).toHaveBeenCalledTimes(1);
    });

    it('stays denied when the permission is still refused', async () => {
      const { result } = await deniedHook();
      currentPermission.mockResolvedValue({
        status: 'denied',
      } as Location.LocationPermissionResponse);

      await backToForeground();

      await waitFor(() => expect(currentPermission).toHaveBeenCalledTimes(1));
      expect(result.current.status).toBe('denied');
    });

    it('does not check the permission when it was not denied', async () => {
      await renderHook(() => useDeviceLocation());

      await backToForeground();

      expect(currentPermission).not.toHaveBeenCalled();
    });
  });
});
