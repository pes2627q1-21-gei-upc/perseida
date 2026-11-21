import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { type Theme, useTheme } from '../../../shared/theme';
import { useReduceTransparency } from '../../../shared/ui';
import { rowSurface } from '../rowSurface';

/**
 * The surface under a quiet button that sits right on the scene (TG-469). The button draws only
 * a rim, so over the pale lake or the moon glow its text would not be legible (WCAG 1.4.3): the
 * pill gives it the glass of the rows, measured at 4.5:1 over the whole scene.
 */
export function ActionSurface({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const reduceTransparency = useReduceTransparency();
  const styles = createStyles(theme, reduceTransparency);

  return <View style={styles.surface}>{children}</View>;
}

// Visual styles: tested through the rendered contrast, not mutated.
// Stryker disable all
function createStyles({ colors, radii }: Theme, reduceTransparency: boolean) {
  return StyleSheet.create({
    surface: {
      borderRadius: radii.pill,
      backgroundColor: rowSurface(colors.surface, reduceTransparency),
    },
  });
}
// Stryker enable all
