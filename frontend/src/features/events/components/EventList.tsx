import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { ClassifiedEvent } from '../classifyEvents';
import { describeEvent, formatEventWhen, formatEventWhere } from '../formatEvent';
import { EventOrb } from './EventOrb';

interface Props {
  events: ClassifiedEvent[];
  /** Accessible name of the list. */
  label: string;
  /** Room at the top for the floating bar of the screen. */
  topInset?: number;
}

function EventRow({ event }: { event: ClassifiedEvent }) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const when = formatEventWhen(event, i18n.language);
  const where = formatEventWhere(event.location, t, i18n.language);
  const active = event.status === 'active';

  return (
    <GlassPanel>
      <View
        accessible
        accessibilityLabel={`${describeEvent(event, t)}, ${when}, ${where}`}
        style={[styles.row, { gap: spacing.md }]}
      >
        <EventOrb category={event.category} active={active} />
        <View style={[styles.text, { gap: spacing.xs }]}>
          <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{event.title}</Text>
          <Text style={[typography.caption, { color: colors.text.secondary }]}>{when}</Text>
          <Text style={[typography.caption, { color: colors.text.secondary }]}>{where}</Text>
          {active && (
            <Text style={[typography.caption, { color: colors.text.primary }]}>
              {t('events.status.active')}
            </Text>
          )}
        </View>
      </View>
    </GlassPanel>
  );
}

/** List view of the events map (TG-52): every event, also the ones without a location. */
export function EventList({ events, label, topInset = 0 }: Props) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      accessibilityRole="list"
      accessibilityLabel={label}
      data={events}
      keyExtractor={(event) => event.id}
      renderItem={({ item }) => <EventRow event={item} />}
      contentContainerStyle={[
        styles.content,
        {
          maxWidth: readingMaxWidth,
          gap: spacing.md,
          paddingTop: topInset + spacing.md,
          paddingBottom: insets.bottom + spacing.xxl,
          paddingLeft: insets.left + spacing.md,
          paddingRight: insets.right + spacing.md,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
});
