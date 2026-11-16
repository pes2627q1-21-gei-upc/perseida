import type { ViewProps, ViewStyle } from 'react-native';

type Os = 'web' | 'android' | 'ios' | 'windows' | 'macos';

/**
 * Props of a layer that stays mounted and laid out but can be hidden, like the events map
 * under the list (TG-626): a new mount would reload the map and lose the user's camera.
 * Hidden, it is invisible, untouchable and out of the accessibility tree (WCAG 2.2 AA).
 * - Native: `accessibilityElementsHidden` (iOS) and `importantForAccessibility` (Android).
 * - Web: react-native-web ignores those two, so `visibility: hidden` takes the layer out of the
 *   tab order and of screen readers without changing its size (Leaflet keeps its layout), and
 *   `aria-hidden` reaches the DOM.
 */
export function hiddenLayerProps(hidden: boolean, os: Os): ViewProps {
  if (!hidden) return { pointerEvents: 'auto' };
  if (os === 'web') {
    // `visibility` is a web-only style: react-native-web passes it to the DOM.
    const style = { opacity: 0, visibility: 'hidden' } as ViewStyle;
    return { style, pointerEvents: 'none', 'aria-hidden': true };
  }
  return {
    style: { opacity: 0 },
    pointerEvents: 'none',
    'aria-hidden': true,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  };
}
