import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * System "Reduce transparency" setting. iOS reports it; Android always says false and
 * React Native Web does not implement it, so the API is checked before calling it.
 */
export function useReduceTransparency(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof AccessibilityInfo.isReduceTransparencyEnabled !== 'function') return undefined;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (mounted) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setEnabled,
    );
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return enabled;
}
