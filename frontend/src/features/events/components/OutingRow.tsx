import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import type { Outing } from '../../outings/api/outings';
import { describeOuting, formatDateTime } from '../../outings/formatOuting';

interface Props {
  outing: Outing;
  /** Makes the row a button that opens the summary of the outing. */
  onPress?: () => void;
}

/**
 * One outing in the list (TG-52): its title, that it is an outing and when it starts. Read as
 * a single item. It has no material of its own: it goes on glass.
 */
export function OutingRow({ outing, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const label = describeOuting(outing, t, i18n.language);

  const content = (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{outing.title}</Text>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {t('events.outings.kind')}
      </Text>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {formatDateTime(outing.starts_at, i18n.language)}
      </Text>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={styles.row}>
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
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
