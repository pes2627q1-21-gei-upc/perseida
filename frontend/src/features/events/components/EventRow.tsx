import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import type { ClassifiedEvent } from '../classifyEvents';
import { describeEvent, formatEventWhen, formatEventWhere } from '../formatEvent';
import { EventOrb } from './EventOrb';

interface Props {
  event: ClassifiedEvent;
  /** Under the map every event is visible from anywhere, so the place would only repeat. */
  showWhere?: boolean;
}

/**
 * One event: its orb, title, dates, where it can be seen and whether it is happening now.
 * Read as a single item that says all of it. It has no material of its own: it goes on glass.
 */
export function EventRow({ event, showWhere = true }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const when = formatEventWhen(event, i18n.language);
  const where = formatEventWhere(event.location, t, i18n.language);
  const active = event.status === 'active';

  return (
    <View
      accessible
      accessibilityLabel={`${describeEvent(event, t)}, ${when}, ${where}`}
      style={[styles.row, { gap: spacing.md }]}
    >
      <EventOrb category={event.category} active={active} />
      <View style={[styles.text, { gap: spacing.xs }]}>
        <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{event.title}</Text>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>{when}</Text>
        {showWhere && (
          <Text style={[typography.caption, { color: colors.text.secondary }]}>{where}</Text>
        )}
        {active && (
          <Text style={[typography.caption, { color: colors.text.primary }]}>
            {t('events.status.active')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
});
