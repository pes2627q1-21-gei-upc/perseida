import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

import { useTheme } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  /** Decorative icon before the label; the label carries the meaning. */
  icon?: ReactNode;
  /** An action is in progress: the button is announced as busy and ignores taps. */
  busy?: boolean;
}

/**
 * Secondary action: a pill with only a thin glass-coloured rim, no gel and no glass layer.
 * Gel is for the main action of a screen and glass is for floating layers (principis.md).
 */
export function QuietButton({ label, onPress, accessibilityHint, icon, busy = false }: Props) {
  const theme = useTheme();
  const { surface, text } = theme.colors;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch.min,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: surface.glassBorder,
        backgroundColor: pressed ? surface.glass : 'transparent',
        opacity: busy ? 0.6 : 1,
      })}
    >
      {icon}
      <Text style={[theme.typography.bodyStrong, { color: text.primary }]}>{label}</Text>
    </Pressable>
  );
}
