import { useState } from 'react';
import { type KeyboardTypeOptions, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '../../../shared/theme';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  /** Already translated message of the field. */
  error?: string;
}

/** Text field with a visible label, the focus ring and its error under it, read with the field. */
export function TextField({
  label,
  value,
  onChangeText,
  onBlur,
  multiline,
  keyboardType,
  error,
}: TextFieldProps) {
  const { colors, radii, spacing, touch, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const highlighted = focused || Boolean(error);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        // The error goes in the hint, so it is read when the field gets the focus.
        accessibilityHint={error}
        multiline={multiline}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        style={[
          typography.body,
          styles.input,
          {
            minHeight: multiline ? touch.min * 2 : touch.min,
            padding: spacing.md,
            borderRadius: radii.md,
            color: colors.text.primary,
            backgroundColor: colors.surface.onGlass,
            borderColor: highlighted ? colors.focusRing : colors.surface.glassBorder,
            borderWidth: highlighted ? 2 : 1,
          },
        ]}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[typography.caption, { color: colors.state.danger }]}
      >
        {error ?? ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { width: '100%' },
});
