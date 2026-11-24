import type { ReactTestInstance } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import { colors } from '../src/shared/theme/colors';

const glassBorders: string[] = Object.values(colors).map((theme) => theme.surface.glassBorder);

/** True when the node sits inside a `GlassPanel` (its wrapper is the only view with a glass border). */
export function isOnGlass(node: ReactTestInstance): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const style = StyleSheet.flatten(parent.props.style);
    if (style?.borderWidth === 1 && glassBorders.includes(style.borderColor)) return true;
  }
  return false;
}
