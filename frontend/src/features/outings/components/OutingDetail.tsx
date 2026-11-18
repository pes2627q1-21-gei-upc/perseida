import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { GelButton, QuietButton } from '../../../shared/ui';
import type { Outing } from '../api/outings';
import { formatCoordinate, formatDateTime } from '../formatOuting';

interface Props {
  outing: Outing;
  /** Only the author can change the outing: nobody else gets the buttons. */
  isAuthor: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.text.primary }]}>{value}</Text>
    </View>
  );
}

/** One outing in full (TG-629): when, where, who organises it and, for the author, the buttons. */
export function OutingDetail({ outing, isAuthor, onEdit, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const { latitude, longitude } = outing.location;

  return (
    <View style={{ gap: spacing.md }}>
      <Text
        accessibilityRole="header"
        style={[typography.headline, { color: colors.text.primary }]}
      >
        {outing.title}
      </Text>
      {outing.description ? (
        <Text testID="outing-description" style={[typography.body, { color: colors.text.primary }]}>
          {outing.description}
        </Text>
      ) : null}
      <DetailRow
        label={t('outings.detail.start')}
        value={formatDateTime(outing.starts_at, i18n.language)}
      />
      <DetailRow
        label={t('outings.detail.end')}
        value={formatDateTime(outing.ends_at, i18n.language)}
      />
      <DetailRow
        label={t('outings.detail.where')}
        value={`${formatCoordinate(latitude, i18n.language)} · ${formatCoordinate(longitude, i18n.language)}`}
      />
      <DetailRow
        label={t('outings.detail.author')}
        value={outing.author.display_name ?? t('outings.detail.unknownAuthor')}
      />
      {isAuthor ? (
        <View style={[styles.actions, { gap: spacing.sm }]}>
          <QuietButton label={t('outings.detail.delete')} onPress={onDelete} />
          <GelButton label={t('outings.detail.edit')} onPress={onEdit} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
});
