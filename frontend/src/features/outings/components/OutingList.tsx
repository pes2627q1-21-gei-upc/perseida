import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { Outing } from '../api/outings';
import { formatDateTime } from '../formatOuting';
import { useEventTitle } from '../hooks/useEventTitle';

interface Props {
  outings: Outing[];
  /** Accessible name of the list. */
  label: string;
  /** Room at the top for the floating bar of the screen. */
  topInset?: number;
  /** Opens the outing the person taps. */
  onSelect: (id: string) => void;
}

/** One outing: title, when it starts and who organises it. It goes on glass, as one button. */
function OutingRow({ outing, onPress }: { outing: Outing; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const when = formatDateTime(outing.starts_at, i18n.language);
  const author = `${t('outings.detail.author')}: ${
    outing.author.display_name ?? t('outings.detail.unknownAuthor')
  }`;
  const eventTitle = useEventTitle(outing.event_id);
  // The title is looked up among the events of the map: if it is not known, only that there is one.
  let event: string | null = null;
  if (outing.event_id) {
    event = eventTitle
      ? `${t('outings.detail.event')}: ${eventTitle}`
      : t('outings.form.linkedEvent');
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[outing.title, when, author, event].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [{ gap: spacing.xs, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{outing.title}</Text>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>{when}</Text>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>{author}</Text>
      {event ? (
        <Text style={[typography.caption, { color: colors.text.secondary }]}>{event}</Text>
      ) : null}
    </Pressable>
  );
}

/** List of outings (TG-629): the ones of a person or the ones of an event. */
export function OutingList({ outings, label, topInset = 0, onSelect }: Props) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      accessibilityRole="list"
      accessibilityLabel={label}
      data={outings}
      keyExtractor={(outing) => outing.id}
      renderItem={({ item }) => (
        <GlassPanel>
          <OutingRow outing={item} onPress={() => onSelect(item.id)} />
        </GlassPanel>
      )}
      ListFooterComponent={<View style={{ height: insets.bottom }} />}
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
