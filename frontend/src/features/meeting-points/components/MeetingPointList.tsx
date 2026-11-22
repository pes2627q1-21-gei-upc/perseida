import { type ReactElement, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, FlatList, Platform, ScrollView, StyleSheet, Text } from 'react-native';
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
  /** What goes above the points and scrolls with them, in every state of the list. */
  header?: ReactElement;
}

/**
 * The recommended meeting points (TG-352), in the order of the API, each on glass; or the
 * loading, empty or error state of the list. Whatever the state, the header scrolls with it, so
 * nothing is cut off on short screens (WCAG 1.4.10).
 */
export function MeetingPointList({
  status,
  points,
  error,
  onRetry,
  onChoose,
  topInset = 0,
  header,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const texts = {
    loadingLabel: t('meetingPoints.loading'),
    retry: t('meetingPoints.retry'),
    retryHint: t('meetingPoints.retryHint'),
  };
  const empty = status === 'success' && points.length === 0 ? t('meetingPoints.empty') : undefined;

  useEffect(() => {
    // Android reads the live region by itself; iOS needs an explicit announcement.
    if (empty && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(empty);
  }, [empty]);

  // Keeps the points clear of the safe areas and of the bar at the top (tested).
  const padding = {
    paddingTop: topInset + spacing.md,
    paddingBottom: insets.bottom + spacing.md,
    paddingLeft: insets.left + spacing.md,
    paddingRight: insets.right + spacing.md,
  };

  // Visual only: layout and colours of the list, not seen by the tests nor mutated.
  // Stryker disable all
  const look = {
    emptyText: [typography.body, styles.center, { color: colors.text.primary }],
    list: [styles.column, { maxWidth: readingMaxWidth, gap: spacing.md }, padding],
    state: [styles.column, styles.grow, { maxWidth: readingMaxWidth, gap: spacing.md }, padding],
  };
  // Stryker restore all

  let state: ReactElement | null = null;
  if (status === 'loading') state = <StatusPanel state="loading" texts={texts} />;
  else if (status === 'error') {
    state = (
      <StatusPanel
        state="error"
        texts={texts}
        code={error?.code ?? 'GENERIC_FINAL'}
        onRetry={error?.retryable ? onRetry : undefined}
      />
    );
  } else if (empty) {
    state = (
      <GlassPanel>
        <Text accessibilityLiveRegion="polite" style={look.emptyText}>
          {empty}
        </Text>
      </GlassPanel>
    );
  }

  if (state) {
    return (
      <ScrollView contentContainerStyle={look.state}>
        {header}
        {state}
      </ScrollView>
    );
  }

  return (
    <FlatList
      accessibilityRole="list"
      accessibilityLabel={t('meetingPoints.list.label')}
      data={points}
      keyExtractor={keyOf}
      renderItem={({ item }) => (
        <GlassPanel>
          <MeetingPointRow point={item} onChoose={onChoose ? () => onChoose(item) : undefined} />
        </GlassPanel>
      )}
      ListHeaderComponent={header}
      contentContainerStyle={look.list}
    />
  );
}

// Visual styles and React keys, not mutated.
// Stryker disable all
function keyOf(point: MeetingPoint) {
  return String(point.id);
}

const styles = StyleSheet.create({
  column: { width: '100%', alignSelf: 'center' },
  center: { textAlign: 'center' },
  grow: { flexGrow: 1 },
});
