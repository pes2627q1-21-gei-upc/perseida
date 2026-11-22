import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  FlatList,
  Platform,
  type StyleProp,
  Text,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../../../shared/theme';
import { GlassPanel, StatusPanel } from '../../../shared/ui';
import { type ClassifiedEvent, statusOn } from '../classifyEvents';
import { useMySubscriptions } from '../hooks/useSubscriptions';

interface Props {
  /** Top of the screen (title and tabs), first in the list so it scrolls with it. */
  header: ReactElement;
  contentContainerStyle: StyleProp<ViewStyle>;
  /** Draws a row, the same way as on «All». */
  renderRow: (event: ClassifiedEvent) => ReactElement;
}

/** «Mine» of the Events tab (TG-53): the events the user follows, without filters. */
export function MyEvents({ header, contentContainerStyle, renderRow }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { data, isLoading, isError, error, refetch } = useMySubscriptions();
  const empty = data !== undefined && data.length === 0 ? t('events.mine.empty') : undefined;

  useEffect(() => {
    // Android and the web read the polite live region by themselves; iOS needs an announcement.
    if (empty && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(empty);
  }, [empty]);

  const now = new Date();
  const events = isError
    ? []
    : (data ?? []).map((event) => ({ ...event, status: statusOn(event, now) }));
  const statusTexts = {
    loadingLabel: t('events.loading'),
    retry: t('events.retry'),
    retryHint: t('events.retryHint'),
  };

  function renderEmpty() {
    if (isLoading) return <StatusPanel state="loading" texts={statusTexts} />;
    if (isError) {
      return (
        <StatusPanel
          state="error"
          texts={statusTexts}
          code={error.code}
          onRetry={error.retryable ? () => void refetch() : undefined}
        />
      );
    }
    return (
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

  return (
    <FlatList
      data={events}
      keyExtractor={(event) => event.id}
      ListHeaderComponent={header}
      ListEmptyComponent={renderEmpty()}
      renderItem={({ item }) => renderRow(item)}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
    />
  );
}
