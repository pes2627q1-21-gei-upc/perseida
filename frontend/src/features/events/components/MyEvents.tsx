import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, Text } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { GlassPanel, StatusPanel } from '../../../shared/ui';
import { type ClassifiedEvent, statusOn } from '../classifyEvents';
import { useMySubscriptions } from '../hooks/useSubscriptions';

interface MyEventsView {
  /** The events the user follows, with their status now; none while loading or on error. */
  events: ClassifiedEvent[];
  /** What the list shows when it has no rows: loading, error with retry, or empty. */
  empty: ReactElement;
}

/**
 * «Mine» of the Events tab (TG-53): the events the user follows, without filters. It gives the
 * rows and the empty state, and the screen draws them in the same list as «All» so the tabs
 * are never unmounted when switching (review of the PR #138, WCAG 2.4.3).
 *
 * `active` is true while «Mine» is shown: only then is its empty state announced on iOS.
 */
export function useMyEvents(active: boolean): MyEventsView {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { data, isLoading, isError, error, refetch } = useMySubscriptions();
  const empty = data !== undefined && data.length === 0 ? t('events.mine.empty') : undefined;

  useEffect(() => {
    // Android and the web read the polite live region by themselves; iOS needs an announcement.
    if (active && empty && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(empty);
  }, [active, empty]);

  const now = new Date();
  const events = isError
    ? []
    : (data ?? []).map((event) => ({ ...event, status: statusOn(event, now) }));
  const statusTexts = {
    loadingLabel: t('events.loading'),
    retry: t('events.retry'),
    retryHint: t('events.retryHint'),
  };

  let emptyState: ReactElement;
  if (isLoading) emptyState = <StatusPanel state="loading" texts={statusTexts} />;
  else if (isError) {
    emptyState = (
      <StatusPanel
        state="error"
        texts={statusTexts}
        code={error.code}
        onRetry={error.retryable ? () => void refetch() : undefined}
      />
    );
  } else {
    emptyState = (
      <GlassPanel>
        <Text
          accessibilityLiveRegion="polite"
          aria-live="polite"
          style={[typography.body, { color: colors.text.primary }]}
        >
          {empty}
        </Text>
      </GlassPanel>
    );
  }

  return { events, empty: emptyState };
}
