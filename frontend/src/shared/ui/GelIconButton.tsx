import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';

const DISABLED_OPACITY = 0.6;

interface Props {
  /** What the button does; the icon is decorative. */
  label: string;
  /** Icon of size iconSizes.md in gel.text, e.g. a paper plane to send. */
  icon: ReactNode;
  onPress: () => void;
  accessibilityHint?: string;
  /** Cannot be pressed now: it says so and dims. */
  disabled?: boolean;
  /** An action is in progress: announced as busy, a spinner replaces the icon, taps are ignored. */
  busy?: boolean;
}

/**
 * Round main action with the gel material (TG-469), for a place with room only for an icon,
 * such as sending a message. The gloss stops above an icon of iconSizes.md, so the icon keeps its
 * 3:1 on the body (tokens.md); pressed, the body darkens and the gloss goes, with no change of size.
 */
export function GelIconButton({
  label,
  icon,
  onPress,
  accessibilityHint,
  disabled = false,
  busy = false,
}: Props) {
  const { colors, touch, radii, iconSizes } = useTheme();
  const { gel } = colors;
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          minHeight: touch.min,
          width: touch.min,
          borderRadius: radii.pill,
          boxShadow: `0 6px 16px ${gel.rim}59`,
          opacity: disabled && !busy ? DISABLED_OPACITY : 1,
        },
      ]}
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
              pointerEvents="none"
              style={[styles.gloss, { height: (touch.min - iconSizes.md) / 2 }]}
            />
          )}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.rim,
              { borderRadius: radii.pill, borderColor: gel.rim },
            ]}
          />
          {busy ? <ActivityIndicator color={gel.text} /> : icon}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0 },
  rim: { borderWidth: 1, opacity: 0.5 },
});
