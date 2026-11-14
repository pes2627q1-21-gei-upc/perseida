import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import type { ClassifiedEvent } from '../classifyEvents';
import { describeEvent, formatEventWhen, formatEventWhere } from '../formatEvent';
import { EventOrb } from './EventOrb';

interface Props {
  event: ClassifiedEvent;
  /** Makes the row a button that opens the summary of the event. */
  onPress?: () => void;
}

/**
 * One event: its orb, title, dates, where it can be seen and whether it is happening now.
 * Read as a single item that says all of it. It has no material of its own: it goes on glass.
 */
export function EventRow({ event, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const when = formatEventWhen(event, i18n.language);
  const where = formatEventWhere(event.location, t, i18n.language);
  const active = event.status === 'active';

  const label = `${describeEvent(event, t)}, ${when}, ${where}`;
  const content = (
    <>
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
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={[styles.row, { gap: spacing.md }]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('events.sheet.openHint')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { gap: spacing.md, opacity: pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
});
