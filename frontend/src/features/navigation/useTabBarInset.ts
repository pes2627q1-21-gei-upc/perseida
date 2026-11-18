import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom space a screen of the `(app)` group leaves so the floating tab bar (`position:
 * absolute`) never covers its content: the real height of the bar, which already includes the
 * bottom safe area. Outside the tab bar (tests, other stacks) it is just the safe area.
 * The context is read directly because `useBottomTabBarHeight` throws outside the navigator.
 */
export function useTabBarInset(): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  return tabBarHeight ?? insets.bottom;
}
