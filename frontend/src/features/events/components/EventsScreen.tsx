import { useRouter } from 'expo-router';
import { MapTrifold } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import {
  GelChip,
  GelSegmented,
  GlassPanel,
  QuietButton,
  SkyBackground,
  StatusPanel,
} from '../../../shared/ui';
import { useTabBarInset } from '../../navigation/useTabBarInset';
import type {
  AstronomicalEvent,
  EventCategory,
  EventSearchFilters,
  SearchRange,
} from '../api/getEvents';
import type { ClassifiedEvent } from '../classifyEvents';
import { distanceKm } from '../distance';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { useEventSearch } from '../hooks/useEventSearch';
import { EventRow } from './EventRow';

/** Order of the category chips; the chosen ones are sent in this order. */
const CATEGORIES: readonly EventCategory[] = ['lunar', 'solar', 'meteor_shower', 'launch'];
const RANGES: readonly SearchRange[] = [7, 30, 90];
const DEFAULT_RANGE: SearchRange = 30;

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Active when it is under way at some moment of today (UTC), like GET /api/events/active. */
function classify(event: AstronomicalEvent, today: string): ClassifiedEvent {
  const active =
    utcDay(new Date(event.starts_at)) <= today && today <= utcDay(new Date(event.ends_at));
  return { ...event, status: active ? 'active' : 'upcoming' };
}

/**
 * Events tab (TG-51): the events of the chosen categories and date range, and near the device
 * when «Near me» is on, with the distance to the ones that have a place. Rows open nothing yet.
 */
export function EventsScreen() {
  const { t } = useTranslation();
  const { colors, iconSizes, spacing, touch, typography } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const location = useDeviceLocation();

  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [range, setRange] = useState<SearchRange>(DEFAULT_RANGE);
  const [nearOn, setNearOn] = useState(false);

  const denied = location.status === 'denied';
  const near = nearOn && !denied ? location.position : null;
  const filters: EventSearchFilters = { categories, range, near };
  const { data, isLoading, isError, error, refetch } = useEventSearch(filters);

  const today = utcDay(new Date());
  const events = isError ? [] : (data ?? []).map((event) => classify(event, today));

  function toggleCategory(category: EventCategory) {
    setCategories((chosen) =>
      CATEGORIES.filter((item) =>
        item === category ? !chosen.includes(item) : chosen.includes(item),
      ),
    );
  }

  function toggleNear(on: boolean) {
    setNearOn(on);
    if (on) void location.request();
  }

  const secondary = [typography.caption, { color: colors.text.secondary }];
  const statusTexts = {
    loadingLabel: t('events.loading'),
    retry: t('events.retry'),
    retryHint: t('events.retryHint'),
  };

  const header = (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.titleRow, { gap: spacing.sm }]}>
        <Text
          accessibilityRole="header"
          style={[typography.headline, styles.title, { color: colors.text.primary }]}
        >
          {t('nav.events')}
        </Text>
        <QuietButton
          label={t('events.search.openMap')}
          icon={<MapTrifold size={iconSizes.md} color={colors.text.primary} />}
          onPress={() => router.push('/map')}
        />
      </View>

      <GlassPanel>
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>
              {t('events.search.categories')}
            </Text>
            <View
              role="group"
              accessibilityLabel={t('events.search.categories')}
              style={[styles.chips, { gap: spacing.sm }]}
            >
              {CATEGORIES.map((category) => (
                <GelChip
                  key={category}
                  label={t(`events.category.${category}`)}
                  selected={categories.includes(category)}
                  onPress={() => toggleCategory(category)}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>
              {t('events.search.range.label')}
            </Text>
            <GelSegmented
              kind="choice"
              accessibilityLabel={t('events.search.range.label')}
              value={String(range)}
              onChange={(value) => setRange(Number(value) as SearchRange)}
              options={RANGES.map((days) => ({
                value: String(days),
                label: t(`events.search.range.days${days}`),
              }))}
            />
          </View>

          <View style={{ gap: spacing.xs }}>
            <View style={[styles.nearRow, { gap: spacing.md, minHeight: touch.min }]}>
              <Text style={[typography.bodyStrong, styles.title, { color: colors.text.primary }]}>
                {t('events.search.near.label')}
              </Text>
              <Switch
                accessibilityLabel={t('events.search.near.label')}
                value={nearOn && !denied}
                disabled={denied}
                // iOS only sets the native prop: screen readers and tests read the state.
                accessibilityState={{ disabled: denied }}
                onValueChange={toggleNear}
                trackColor={{ false: colors.surface.glassBorder, true: colors.gel.body[0] }}
                thumbColor={colors.gel.text}
              />
            </View>
            {nearOn && location.status === 'locating' && (
              <Text accessibilityLiveRegion="polite" aria-live="polite" style={secondary}>
                {t('events.search.near.locating')}
              </Text>
            )}
            {denied && (
              <Text accessibilityLiveRegion="polite" aria-live="polite" style={secondary}>
                {t('events.search.near.denied')}
              </Text>
            )}
          </View>
        </View>
      </GlassPanel>

      {!isError && data !== undefined && data.length > 0 && (
        <Text
          accessibilityLiveRegion="polite"
          aria-live="polite"
          style={[typography.bodyStrong, { color: colors.text.primary }]}
        >
          {t('events.search.results', { count: data.length })}
        </Text>
      )}
    </View>
  );

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
          {t('events.search.empty')}
        </Text>
      </GlassPanel>
    );
  }

  return (
    <SkyBackground>
      <FlatList
        data={events}
        keyExtractor={(event) => event.id}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty()}
        renderItem={({ item }) => (
          <GlassPanel>
            <EventRow
              event={item}
              distanceKm={near && item.location ? distanceKm(near, item.location) : undefined}
            />
          </GlassPanel>
        )}
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: readingMaxWidth,
            gap: spacing.md,
            paddingTop: insets.top + spacing.lg,
            paddingBottom: tabBarInset + spacing.lg,
            paddingLeft: insets.left + spacing.md,
            paddingRight: insets.right + spacing.md,
          },
        ]}
        showsVerticalScrollIndicator={false}
      />
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', alignSelf: 'center' },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  title: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  nearRow: { flexDirection: 'row', alignItems: 'center' },
});
