import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { useReduceTransparency } from '../../../shared/ui';
import { rowSurface } from '../rowSurface';

/**
 * The surface under a quiet button that sits right on the scene (TG-469). The button draws only
 * a rim, so over the pale lake or the moon glow its text would not be legible (WCAG 1.4.3): the
 * pill gives it the glass of the rows, measured at 4.5:1 over the whole scene.
 */
export function ActionSurface({ children }: { children: ReactNode }) {
  const { colors, radii } = useTheme();
  const reduceTransparency = useReduceTransparency();

  return (
    <View
      style={{
        borderRadius: radii.pill,
        backgroundColor: rowSurface(colors.surface, reduceTransparency),
      }}
    >
      {children}
    </View>
  );
}
