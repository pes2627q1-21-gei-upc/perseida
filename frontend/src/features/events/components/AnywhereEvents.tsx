import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { ClassifiedEvent } from '../classifyEvents';
import { EventRow } from './EventRow';

interface Props {
  /** Events without a location: they can be seen from anywhere, so they are not markers. */
  events: ClassifiedEvent[];
}

/**
 * Half of the map view under the events map (TG-52, criterion 4): the events visible from
 * anywhere, which cannot be a point on the map. It shares the screen half and half with the
 * map (both flex 1) and scrolls inside its half. It sits under the map, not over it, so it
 * never hides the attribution of the tiles. With no such events it is not shown.
 */
export function AnywhereEvents({ events }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (events.length === 0) return null;
  const title = t('events.anywhere.title');

  return (
    <View
      testID="anywhere-events"
      style={[
        styles.strip,
        {
          maxWidth: readingMaxWidth,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.sm,
          paddingLeft: insets.left + theme.spacing.md,
          paddingRight: insets.right + theme.spacing.md,
        },
      ]}
    >
      <GlassPanel fill>
        <View style={[styles.fill, { gap: theme.spacing.sm }]}>
          <Text
            accessibilityRole="header"
            style={[theme.typography.bodyStrong, { color: theme.colors.text.primary }]}
          >
            {title}
          </Text>
          <ScrollView
            accessibilityRole="list"
            accessibilityLabel={title}
            style={styles.fill}
            contentContainerStyle={{ gap: theme.spacing.md }}
          >
            {events.map((event) => (
              <EventRow key={event.id} event={event} showWhere={false} />
            ))}
          </ScrollView>
        </View>
      </GlassPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flex: 1, width: '100%', alignSelf: 'center' },
  fill: { flex: 1 },
});
