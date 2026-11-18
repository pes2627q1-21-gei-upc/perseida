import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { formatDateTime } from '../formatOuting';

interface Props {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
  /** Already translated message of the field. */
  error?: string;
}

/**
 * Date and time of the outing. iOS has one native control for both. Android only has them
 * apart, so a tap asks for the day and then for the time (the person can close either one:
 * nothing changes then).
 */
export function DateTimeField({ label, value, onChange, error }: Props) {
  const { i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, typography } = theme;

  function askOnAndroid() {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      onValueChange: (_event, day) => {
        DateTimePickerAndroid.open({
          value: day,
          mode: 'time',
          is24Hour: true,
          onValueChange: (_timeEvent, time) => {
            const result = new Date(day);
            result.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(result);
          },
        });
      },
    });
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{label}</Text>
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${formatDateTime(value, i18n.language)}`}
          onPress={askOnAndroid}
          style={[
            styles.button,
            {
              minHeight: theme.touch.min,
              borderRadius: theme.radii.md,
              borderColor: error ? colors.state.danger : colors.surface.glassBorder,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <Text style={[typography.body, { color: colors.text.primary }]}>
            {formatDateTime(value, i18n.language)}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.picker}>
          <DateTimePicker
            accessibilityLabel={label}
            value={value}
            mode="datetime"
            display="compact"
            themeVariant={theme.name === 'dia' ? 'light' : 'dark'}
            onValueChange={(_event, date) => onChange(date)}
          />
        </View>
      )}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: colors.state.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, justifyContent: 'center' },
  picker: { alignItems: 'flex-start' },
});
