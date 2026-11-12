import { FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { ClassifiedEvent } from '../classifyEvents';
import { EventRow } from './EventRow';

interface Props {
  events: ClassifiedEvent[];
  /** Accessible name of the list. */
  label: string;
  /** Room at the top for the floating bar of the screen. */
  topInset?: number;
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
      renderItem={({ item }) => (
        <GlassPanel>
          <EventRow event={item} />
        </GlassPanel>
      )}
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
});
