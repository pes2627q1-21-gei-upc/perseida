import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';

/** Share of the screen height taken by the lake at the bottom. */
const LAKE_HEIGHT = '24%';
/** The lake reflects the sky: the same gradient, inverted, at 35 % (cel-viu.md). */
const LAKE_REFLECTION_OPACITY = 0.35;
const WATERLINE_COLOR = 'rgba(255,255,255,0.5)';

interface Props {
  children: ReactNode;
}

/**
 * Static version of the "Cel viu" scene: sky gradient and a calm lake.
 * The live scene (meadow, bubbles, aurora with Skia) is not implemented yet.
 */
export function SkyBackground({ children }: Props) {
  const { colors } = useTheme();
  const sky: [string, string] = [colors.sky.top, colors.sky.low];

  return (
    <View style={styles.root}>
      <LinearGradient colors={sky} style={StyleSheet.absoluteFill} />
      <View
        style={[styles.lake, { height: LAKE_HEIGHT }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <LinearGradient
          colors={[colors.sky.low, colors.sky.top]}
          style={[StyleSheet.absoluteFill, { opacity: LAKE_REFLECTION_OPACITY }]}
        />
        <View style={[styles.waterline, { backgroundColor: WATERLINE_COLOR }]} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  lake: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  waterline: { height: StyleSheet.hairlineWidth * 2 },
});
