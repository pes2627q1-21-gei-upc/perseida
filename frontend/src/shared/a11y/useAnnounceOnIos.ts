import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Reads a message out to a screen reader when it appears. Android reads a live region by
 * itself; iOS needs an explicit announcement (the same as StatusPanel does).
 */
export function useAnnounceOnIos(message: string | undefined) {
  useEffect(() => {
    if (message && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}
