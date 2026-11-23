import { AccessibilityInfo, type View } from 'react-native';
import type { ComponentRef } from 'react';

/**
 * Moves the screen reader focus (and the keyboard one on the web) to an element.
 * react-native-web has no `sendAccessibilityEvent` (calling it throws), so there the element
 * takes the focus itself. It never throws.
 */
export function moveFocusTo(element: ComponentRef<typeof View>) {
  if (typeof AccessibilityInfo.sendAccessibilityEvent === 'function')
    AccessibilityInfo.sendAccessibilityEvent(element, 'focus');
  else element.focus?.();
}
