import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme';

/** The highlight covers the top 46 % so it never lightens the body under the text (tokens.md). */
const HIGHLIGHT_HEIGHT = '46%';

interface Props {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  /** Decorative icon before the label; the label carries the meaning. */
  icon?: ReactNode;
  /** An action is in progress: the button is announced as busy and ignores taps (WCAG 4.1.2). */
  busy?: boolean;
  /** When disabled, the button cannot be pressed and reduces opacity. */
  disabled?: boolean;
}

/** Main action button with the "gel" material. Simple version: no sound or animation yet. */
export function GelButton({
  label,
  onPress,
  accessibilityHint,
  icon,
  busy = false,
  disabled = false,
}: Props) {
  const theme = useTheme();
  const { gel } = theme.colors;
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={{
        minHeight: theme.touch.min,
        borderRadius: theme.radii.pill,
        overflow: 'hidden',
        boxShadow: `0 8px 20px ${gel.rim}99`,
        opacity: isDisabled ? 0.6 : 1,
      }}
    >
      {({ pressed }) => (
        <>
          <LinearGradient
            colors={pressed ? [gel.bodyPressed, gel.bodyPressed] : gel.body}
            style={StyleSheet.absoluteFill}
          />
          {!pressed && (
            <LinearGradient
              colors={gel.highlight}
              style={[styles.highlight, { height: HIGHLIGHT_HEIGHT }]}
              pointerEvents="none"
            />
          )}
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.rim,
              { borderRadius: theme.radii.pill, borderColor: gel.rim },
            ]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.content,
              {
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.sm,
              },
            ]}
          >
            {icon}
            <Text style={[theme.typography.bodyStrong, { color: gel.text }]}>{label}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  highlight: { position: 'absolute', top: 0, left: 0, right: 0 },
  rim: { borderWidth: 1, opacity: 0.5 },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
