import type { ViewStyle } from 'react-native';

import type { Theme } from '../../shared/theme';
import { rowSurface } from './rowSurface';

/** Shared glass card for event rooms and direct conversations. */
export function rowCardStyle(
  { colors, spacing, radii, touch }: Pick<Theme, 'colors' | 'spacing' | 'radii' | 'touch'>,
  reduceTransparency: boolean,
): ViewStyle {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    minHeight: touch.min,
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderColor: colors.surface.glassBorder,
    backgroundColor: rowSurface(colors.surface, reduceTransparency),
    boxShadow: `0 8px 24px ${colors.accentGlow}33`,
  };
}
