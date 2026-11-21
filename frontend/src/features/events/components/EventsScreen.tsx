import { useRouter } from 'expo-router';
import { MapTrifold } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  FlatList,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import {
  GelChip,
  GelSegmented,
  GlassPanel,
  QuietButton,
  SkyBackground,
  StatusPanel,
  useReduceTransparency,
} from '../../../shared/ui';
import { useTabBarInset } from '../../navigation/useTabBarInset';
import type { EventCategory, EventSearchFilters, SearchRange } from '../api/getEvents';
import { statusOn } from '../classifyEvents';
import { distanceKm } from '../distance';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { useEventSearch } from '../hooks/useEventSearch';
import { EventRow } from './EventRow';

/** Order of the category chips; the chosen ones are sent in this order. */
const CATEGORIES: readonly EventCategory[] = ['lunar', 'solar', 'meteor_shower', 'launch'];
const RANGES: readonly SearchRange[] = [7, 30, 90];
const DEFAULT_RANGE: SearchRange = 30;
/** Height of the native iOS switch (51×31 pt); its hitSlop makes up the rest up to touch.min. */
const SWITCH_HEIGHT = 31;

/**
 * Events tab (TG-51): the events of the chosen categories and date range, and near the device
 * when «Near me» is on, with the distance to the ones that have a place. Rows open nothing yet.
 */
export function EventsScreen() {
  const { t } = useTranslation();
  const { colors, iconSizes, radii, spacing, touch, typography } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const location = useDeviceLocation();

  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [range, setRange] = useState<SearchRange>(DEFAULT_RANGE);
  const [nearOn, setNearOn] = useState(false);

  const denied = location.status === 'denied';
  // Off again when the location fails, but it can be turned on to try again unless denied.
  const nearShown = nearOn && (location.status === 'locating' || location.status === 'granted');
  const near = nearShown ? location.position : null;
  const locationMessage = {
    idle: undefined,
    granted: undefined,
    locating: nearOn ? t('events.search.near.locating') : undefined,
    denied: t('events.search.near.denied'),
    unavailable: t('events.search.near.unavailable'),
  }[location.status];
  const filters: EventSearchFilters = { categories, range, near };
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useEventSearch(filters);

  // What the live regions say; only once the results of the current filters are here.
  let resultsMessage: string | undefined;
  if (data && !isError && !isPlaceholderData) {
    resultsMessage =
      data.length > 0
        ? t('events.search.results', { count: data.length })
        : t('events.search.empty');
  }

  // Android and the web read the polite live regions by themselves; iOS needs an announcement.
  useEffect(() => {
    if (resultsMessage && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(resultsMessage);
    }
  }, [resultsMessage]);
  useEffect(() => {
    if (locationMessage && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(locationMessage);
    }
  }, [locationMessage]);

  const now = new Date();
  const events = isError
    ? []
    : (data ?? []).map((event) => ({ ...event, status: statusOn(event, now) }));

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
                value={nearShown}
                disabled={denied}
                // iOS only sets the native prop: screen readers and tests read the state.
                accessibilityState={{ disabled: denied }}
                onValueChange={toggleNear}
                hitSlop={{
                  top: Math.ceil((touch.min - SWITCH_HEIGHT) / 2),
                  bottom: Math.ceil((touch.min - SWITCH_HEIGHT) / 2),
                }}
                trackColor={{ false: colors.text.secondary, true: colors.gel.body[0] }}
                // Off, the solid glass reads on the text.secondary track (≥ 3:1 in every theme).
                thumbColor={nearShown ? colors.gel.text : colors.surface.glassSolid}
              />
            </View>
            {locationMessage && (
              <Text accessibilityLiveRegion="polite" aria-live="polite" style={secondary}>
                {locationMessage}
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
          // Glass without blur: a BlurView per row is too heavy for a long list.
          <View
            style={[
              styles.row,
              {
                backgroundColor: reduceTransparency
                  ? colors.surface.glassSolid
                  : colors.surface.glass,
                borderColor: colors.surface.glassBorder,
                borderRadius: radii.lg,
                padding: spacing.md,
              },
            ]}
          >
            <EventRow
              event={item}
              distanceKm={
                // The results of the previous filters may not be the ones near the device.
                near && item.location && !isPlaceholderData
                  ? distanceKm(near, item.location)
                  : undefined
              }
            />
          </View>
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
        // While the results of the previous filters are shown, the new ones are on their way.
        accessibilityState={{ busy: isPlaceholderData }}
        aria-busy={isPlaceholderData}
        showsVerticalScrollIndicator={false}
      />
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', alignSelf: 'center' },
  row: { borderWidth: 1 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  title: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  nearRow: { flexDirection: 'row', alignItems: 'center' },
});
