import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { GlassPanel, QuietButton } from '../../../shared/ui';
import { useMapEvents } from '../../events/hooks/useEvents';
import { formatDateTime } from '../formatOuting';

/** The list scrolls on its own past this height, so a long list does not push the form away. */
const LIST_MAX_HEIGHT = 240;

interface Props {
  /** The event the outing is linked to; null if it has none. */
  value: string | null;
  onChange: (eventId: string | null) => void;
}

interface OptionProps {
  label: string;
  checked: boolean;
  onPress: () => void;
  detail?: string;
}

function Option({ label, checked, onPress, detail }: OptionProps) {
  const { colors, radii, spacing, touch, typography } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={{
        minHeight: touch.min,
        justifyContent: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        borderWidth: checked ? 2 : 1,
        borderColor: checked ? colors.focusRing : colors.surface.glassBorder,
        backgroundColor: colors.surface.onGlass,
      }}
    >
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{label}</Text>
      {detail ? (
        <Text style={[typography.caption, { color: colors.text.secondary }]}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The event an outing is linked to (TG-629): none, or one of the events the map shows (the
 * active ones and the ones of the next 30 days). An event that is not in that list any more,
 * but the outing has, stays selected, so editing the outing does not unlink it by accident.
 * If the events do not load, the field says why and the rest of the form keeps working.
 */
export function EventField({ value, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const events = useMapEvents();
  const list = events.data?.all ?? [];
  const inList = value === null || list.some((event) => event.id === value);

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>
        {t('outings.form.event')}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('outings.form.event')}>
        <ScrollView
          nestedScrollEnabled
          style={styles.list}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          <Option
            label={t('outings.form.noEvent')}
            checked={value === null}
            onPress={() => onChange(null)}
          />
          {inList ? null : (
            <Option label={t('outings.form.linkedEvent')} checked onPress={() => onChange(value)} />
          )}
          {list.map((event) => (
            <Option
              key={event.id}
              label={event.title}
              detail={formatDateTime(event.starts_at, i18n.language)}
              checked={event.id === value}
              onPress={() => onChange(event.id)}
            />
          ))}
        </ScrollView>
      </View>
      {events.isLoading ? (
        <GlassPanel>
          <ActivityIndicator color={colors.text.primary} accessibilityLabel={t('events.loading')} />
        </GlassPanel>
      ) : null}
      {events.error ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="alert" style={[typography.body, { color: colors.state.danger }]}>
            {errorMessage(t, events.error.code, events.error.retryable)}
          </Text>
          {events.error.retryable ? (
            <QuietButton label={t('outings.retry')} onPress={() => void events.refetch()} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: LIST_MAX_HEIGHT },
});
