import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { useReduceTransparency } from './useReduceTransparency';

const TOP_HIGHLIGHT = 'rgba(255,255,255,0.5)';

interface Props {
  children: ReactNode;
}

/**
 * Floating glass layer (receptes.md). The background opacity of surface.glass is what
 * gives the contrast, not the blur. With "Reduce transparency" it becomes opaque.
 */
export function GlassPanel({ children }: Props) {
  const theme = useTheme();
  const reduceTransparency = useReduceTransparency();
  const { surface } = theme.colors;

  return (
    <View
      style={[
        styles.wrapper,
        {
          borderRadius: theme.radii.lg,
          borderColor: surface.glassBorder,
          boxShadow: `0 10px 32px ${theme.colors.accentGlow}4D`,
        },
      ]}
    >
      {!reduceTransparency && (
        <BlurView
          intensity={theme.blur.glassLight}
          tint={theme.name === 'dia' ? 'light' : 'dark'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={{
          backgroundColor: reduceTransparency ? surface.glassSolid : surface.glass,
          padding: theme.spacing.md,
        }}
      >
        {children}
      </View>
      <View style={[styles.highlight, { backgroundColor: TOP_HIGHLIGHT }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: 'hidden', borderWidth: 1 },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
});
