import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

import type { Position } from '../distance';

export type LocationStatus = 'idle' | 'locating' | 'granted' | 'denied';

/**
 * Position of the device for «Near me» (TG-51). Nothing is asked until `request()`; a refused
 * permission or a position that cannot be read (location services off) leave it denied.
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
      const { coords } = await Location.getCurrentPositionAsync({});
      setPosition({ latitude: coords.latitude, longitude: coords.longitude });
      setStatus('granted');
    } catch {
      setPosition(null);
      setStatus('denied');
    }
  }, []);

  return { status, position, request };
}
