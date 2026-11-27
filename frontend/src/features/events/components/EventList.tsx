import { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { Outing } from '../../outings/api/outings';
import type { ClassifiedEvent } from '../classifyEvents';
import { EventRow } from './EventRow';
import { OutingRow } from './OutingRow';

interface Props {
  events: ClassifiedEvent[];
  /** Outings listed after the events (TG-52): also the ones without a location. */
  outings?: Outing[];
  /** Accessible name of the list. */
  label: string;
  /** Room at the top for the floating bar of the screen. */
  topInset?: number;
  /** Opens the summary of the event or outing the user taps. */
  onSelect?: (id: string) => void;
}

type Item = { kind: 'event'; event: ClassifiedEvent } | { kind: 'outing'; outing: Outing };

const NO_OUTINGS: Outing[] = [];

/**
 * List view of the events map (TG-52): every event and then the outings, also the ones
 * without a location, which the map cannot show.
 */
export function EventList({ events, outings = NO_OUTINGS, label, topInset = 0, onSelect }: Props) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useMemo<Item[]>(
    () => [
      ...events.map((event) => ({ kind: 'event' as const, event })),
      ...outings.map((outing) => ({ kind: 'outing' as const, outing })),
    ],
    [events, outings],
  );

  return (
    <FlatList
      accessibilityRole="list"
      accessibilityLabel={label}
      data={items}
      keyExtractor={(item) => (item.kind === 'event' ? item.event.id : item.outing.id)}
      renderItem={({ item }) => (
        <GlassPanel>
          {item.kind === 'event' ? (
            <EventRow event={item.event} onPress={onSelect && (() => onSelect(item.event.id))} />
          ) : (
            <OutingRow
              outing={item.outing}
              onPress={onSelect && (() => onSelect(item.outing.id))}
            />
          )}
        </GlassPanel>
      )}
      contentContainerStyle={[
        styles.content,
        {
          maxWidth: readingMaxWidth,
          gap: spacing.md,
          paddingTop: topInset + spacing.md,
          paddingBottom: spacing.md,
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
