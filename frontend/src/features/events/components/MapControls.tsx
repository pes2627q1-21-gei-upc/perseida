import { ListBullets, MapTrifold } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GelSegmented, GlassPanel, type SegmentOption } from '../../../shared/ui';

import type { EventFilter } from '../classifyEvents';

export type EventsView = 'map' | 'list';

interface Props {
  view: EventsView;
  onViewChange: (view: EventsView) => void;
  filter: EventFilter;
  onFilterChange: (filter: EventFilter) => void;
}

/**
 * Controls of the events map (TG-52): the Active | Upcoming | All filter (criterion 2) over the
 * Map | List switch, in one glass panel at the bottom of the screen and in its flow: within
 * reach of the thumb, and never over the map or the list. It keeps clear of the home
 * indicator and stays at a readable width on wide screens.
 */
export function MapControls({ view, onViewChange, filter, onFilterChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const filters: SegmentOption<EventFilter>[] = [
    { value: 'active', label: t('events.filter.active') },
    { value: 'upcoming', label: t('events.filter.upcoming') },
    { value: 'all', label: t('events.filter.all') },
  ];
  const views: SegmentOption<EventsView>[] = [
    {
      value: 'map',
      label: t('events.view.map'),
      icon: (color) => <MapTrifold size={theme.iconSizes.sm} color={color} />,
    },
    {
      value: 'list',
      label: t('events.view.list'),
      icon: (color) => <ListBullets size={theme.iconSizes.sm} color={color} />,
    },
  ];

  return (
    <View
      testID="map-controls"
      style={[
        styles.bar,
        {
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.sm,
          paddingLeft: insets.left + theme.spacing.md,
          paddingRight: insets.right + theme.spacing.md,
        },
      ]}
    >
      <View testID="map-controls-panel" style={[styles.panel, { maxWidth: readingMaxWidth }]}>
        <GlassPanel>
          <View style={{ gap: theme.spacing.sm }}>
            <GelSegmented
              options={filters}
              value={filter}
              onChange={onFilterChange}
              accessibilityLabel={t('events.filter.label')}
              kind="choice"
            />
            <GelSegmented
              options={views}
              value={view}
              onChange={onViewChange}
              accessibilityLabel={t('events.view.label')}
            />
          </View>
        </GlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center' },
  panel: { width: '100%' },
});
