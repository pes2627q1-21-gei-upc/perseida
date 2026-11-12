import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { ClassifiedEvent } from '../classifyEvents';
import { EventRow } from './EventRow';

/** The strip never takes more than this share of the screen: the map stays the main thing. */
const MAX_SCREEN_SHARE = 0.35;

interface Props {
  /** Events without a location: they can be seen from anywhere, so they are not markers. */
  events: ClassifiedEvent[];
}

/**
 * Strip under the events map (TG-52, criterion 4): the events visible from anywhere, which
 * cannot be a point on the map. It sits under the map, not over it, so it never hides the
 * attribution of the tiles. With no such events it is not shown.
 */
export function AnywhereEvents({ events }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  if (events.length === 0) return null;
  const title = t('events.anywhere.title');

  return (
    <View
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
      <GlassPanel>
        <View style={{ gap: theme.spacing.sm }}>
          <Text
            accessibilityRole="header"
            style={[theme.typography.bodyStrong, { color: theme.colors.text.primary }]}
          >
            {title}
          </Text>
          <ScrollView
            accessibilityRole="list"
            accessibilityLabel={title}
            style={{ maxHeight: height * MAX_SCREEN_SHARE }}
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
  strip: { width: '100%', alignSelf: 'center' },
});
