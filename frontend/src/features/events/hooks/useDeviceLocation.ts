import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Position } from '../distance';

/**
 * `denied`: no permission (it can only be given in the settings of the device).
 * `unavailable`: permission, but the position cannot be read (location services off).
 */
export type LocationStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';

/**
 * Position of the device for «Near me» (TG-51). Nothing is asked until `request()`. When the
 * permission was denied, coming back to the app checks it again (without asking): the user may
 * have given it in the settings, and then it goes back to idle.
 */
export function useDeviceLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [position, setPosition] = useState<Position | null>(null);

  const request = useCallback(async () => {
    setStatus('locating');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setPosition(null);
        setStatus('denied');
        return;
      }
    } catch {
      setPosition(null);
      setStatus('denied');
      return;
    }
    try {
      const { coords } = await Location.getCurrentPositionAsync({});
      setPosition({ latitude: coords.latitude, longitude: coords.longitude });
      setStatus('granted');
    } catch {
      setPosition(null);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    if (status !== 'denied') return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      Location.getForegroundPermissionsAsync()
        .then(({ status: current }) => {
          if (current === 'granted') setStatus('idle');
        })
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, [status]);

  return { status, position, request };
}
