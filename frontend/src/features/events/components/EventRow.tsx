import { Star } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import type { ClassifiedEvent } from '../classifyEvents';
import { describeEvent, formatEventWhen, formatEventWhere } from '../formatEvent';
import { EventOrb } from './EventOrb';

interface Props {
  event: ClassifiedEvent;
  /** Distance from the device, when «Near me» is on (TG-51). */
  distanceKm?: number;
  /** Makes the row a button that opens the summary of the event. */
  onPress?: () => void;
  /** Whether the user follows the event (TG-53). */
  subscribed?: boolean;
  /** Shows the star that follows or stops following the event; without it, no star. */
  onToggleSubscription?: () => void;
  /** Already translated message of a failed subscription, shown in the row. */
  subscriptionError?: string;
}

/**
 * One event: its orb, title, dates, where it can be seen and whether it is happening now.
 * Read as a single item that says all of it. It has no material of its own: it goes on glass.
 */
export function EventRow({
  event,
  distanceKm,
  onPress,
  subscribed = false,
  onToggleSubscription,
  subscriptionError,
}: Props) {
  const { t, i18n } = useTranslation();
  const { colors, iconSizes, radii, spacing, touch, typography } = useTheme();
  const when = formatEventWhen(event, i18n.language);
  const where = formatEventWhere(event.location, t, i18n.language);
  const active = event.status === 'active';
  const distance =
    distanceKm === undefined
      ? undefined
      : t('events.search.distance', {
          distance: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(
            distanceKm,
          ),
        });

  const label = [describeEvent(event, t), when, where, distance].filter(Boolean).join(', ');
  const content = (
    <>
      <EventOrb category={event.category} active={active} />
      <View style={[styles.text, { gap: spacing.xs }]}>
        <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{event.title}</Text>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>{when}</Text>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>{where}</Text>
        {distance && (
          <Text style={[typography.caption, { color: colors.text.secondary }]}>{distance}</Text>
        )}
        {active && (
          <Text style={[typography.caption, { color: colors.text.primary }]}>
            {t('events.status.active')}
          </Text>
        )}
      </View>
    </>
  );

  if (onToggleSubscription) {
    // Only the star is a button: the details stay one item for screen readers, beside it.
    return (
      <View style={{ gap: spacing.xs }}>
        <View style={[styles.row, { gap: spacing.sm }]}>
          <View
            accessible
            accessibilityLabel={label}
            style={[styles.row, styles.text, { gap: spacing.md }]}
          >
            {content}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('events.subscription.follow', { title: event.title })}
            accessibilityState={{ selected: subscribed }}
            onPress={onToggleSubscription}
            style={({ pressed }) => ({
              minWidth: touch.min,
              minHeight: touch.min,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surface.onGlass : 'transparent',
            })}
          >
            {/* Outlined or filled: the shape tells the state, not only the colour. */}
            <Star
              size={iconSizes.md}
              color={colors.brand}
              weight={subscribed ? 'fill' : 'regular'}
            />
          </Pressable>
        </View>
        {subscriptionError ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: colors.state.danger }]}
          >
            {subscriptionError}
          </Text>
        ) : null}
      </View>
    );
  }
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
