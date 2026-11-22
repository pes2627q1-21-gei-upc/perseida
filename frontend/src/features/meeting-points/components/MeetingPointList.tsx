import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppError } from '../../../shared/errors';
import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel, StatusPanel } from '../../../shared/ui';
import type { MeetingPoint } from '../api/meetingPoints';
import { MeetingPointRow } from './MeetingPointRow';

interface Props {
  status: 'loading' | 'error' | 'success';
  points: MeetingPoint[];
  error: AppError | null;
  /** Asks again; offered only for transient errors (the hook never retries by itself). */
  onRetry: () => void;
  /** Makes each point a button that picks it. */
  onChoose?: (point: MeetingPoint) => void;
  /** Room at the top for the floating bar of the screen. */
  topInset?: number;
}

/**
 * The recommended meeting points (TG-352), in the order of the API, each on glass; or the
 * loading, empty or error state of the list.
 */
export function MeetingPointList({
  status,
  points,
  error,
  onRetry,
  onChoose,
  topInset = 0,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const texts = {
    loadingLabel: t('meetingPoints.loading'),
    retry: t('meetingPoints.retry'),
    retryHint: t('meetingPoints.retryHint'),
  };

  if (status === 'loading') return <StatusPanel state="loading" texts={texts} />;
  if (status === 'error') {
    return (
      <StatusPanel
        state="error"
        texts={texts}
        code={error?.code ?? 'GENERIC_FINAL'}
        onRetry={error?.retryable ? onRetry : undefined}
      />
    );
  }

  const padding = {
    paddingTop: topInset + spacing.md,
    paddingBottom: insets.bottom + spacing.md,
    paddingLeft: insets.left + spacing.md,
    paddingRight: insets.right + spacing.md,
  };

  if (points.length === 0) {
    return (
      <View style={[styles.column, { maxWidth: readingMaxWidth }, padding]}>
        <GlassPanel>
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.body, styles.center, { color: colors.text.primary }]}
          >
            {t('meetingPoints.empty')}
          </Text>
        </GlassPanel>
      </View>
    );
  }

  return (
    <FlatList
      accessibilityRole="list"
      accessibilityLabel={t('meetingPoints.list.label')}
      data={points}
      keyExtractor={(point) => String(point.id)}
      renderItem={({ item }) => (
        <GlassPanel>
          <MeetingPointRow point={item} onChoose={onChoose ? () => onChoose(item) : undefined} />
        </GlassPanel>
      )}
      contentContainerStyle={[
        styles.column,
        { maxWidth: readingMaxWidth, gap: spacing.md },
        padding,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', alignSelf: 'center' },
  center: { textAlign: 'center' },
});
