import { useId } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';

interface Props {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
  /** Already translated message of the field. */
  error?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` in local time, the format of a `datetime-local` input. */
function toInputValue(date: Date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Date and time of the outing on the web: the browser's own `datetime-local` control, which is
 * keyboard and screen reader friendly. The picker of mobile does not run on the web.
 */
export function DateTimeField({ label, value, onChange, error }: Props) {
  const theme = useTheme();
  const { colors, spacing, typography } = theme;
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text nativeID={labelId} style={[typography.bodyStrong, { color: colors.text.primary }]}>
        {label}
      </Text>
      <input
        id={id}
        type="datetime-local"
        aria-labelledby={labelId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        value={toInputValue(value)}
        onChange={(event) => {
          // An empty or incomplete value is not a date yet: keep the one there was.
          const next = new Date(event.target.value);
          if (event.target.value && !Number.isNaN(next.getTime())) onChange(next);
        }}
        style={{
          fontFamily: typography.body.fontFamily,
          fontSize: typography.body.fontSize,
          minHeight: theme.touch.min,
          boxSizing: 'border-box',
          padding: `0 ${spacing.md}px`,
          borderRadius: theme.radii.md,
          border: `1px solid ${error ? colors.state.danger : colors.surface.glassBorder}`,
          background: 'transparent',
          color: colors.text.primary,
        }}
      />
      {error ? (
        <Text
          nativeID={errorId}
          accessibilityRole="alert"
          style={[typography.caption, { color: colors.state.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
