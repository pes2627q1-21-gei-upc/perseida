import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { colors } from '../src/shared/theme/colors';

/** The part of a test instance this needs. */
interface TestNode {
  parent: TestNode | null;
  props: { style?: StyleProp<ViewStyle> };
}

const glassBorders: unknown[] = Object.values(colors).map((theme) => theme.surface.glassBorder);

/** True when the node sits inside a `GlassPanel` (its wrapper is the only view with a glass border). */
export function isOnGlass(node: TestNode): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const style = StyleSheet.flatten(parent.props.style);
    if (style?.borderWidth === 1 && glassBorders.includes(style.borderColor)) return true;
  }
  return false;
}
