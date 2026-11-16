import { useWindowDimensions } from 'react-native';

import { breakpoints } from '../../shared/theme';

/** From tablet width up the summary of an event sits beside the map instead of over it. */
export function isWide(width: number): boolean {
  return width >= breakpoints.tablet;
}

/** Whether the screen is wide enough for the map and the summary side by side (TG-52). */
export function useIsWide(): boolean {
  return isWide(useWindowDimensions().width);
}
