import { ListBullets, MapTrifold } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GelSegmented, GlassPanel, type SegmentOption } from '../../../shared/ui';

export type EventsView = 'map' | 'list';

interface Props {
  view: EventsView;
  onChange: (view: EventsView) => void;
}

/**
 * Map | List switch of the events map (TG-52), at the bottom of the screen and in its flow:
 * within reach of the thumb, and never over the map or the list. It keeps clear of the home
 * indicator and stays at a readable width on wide screens.
 */
export function MapViewSwitch({ view, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const options: SegmentOption<EventsView>[] = [
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
      testID="map-view-switch"
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
      <View testID="map-view-switch-panel" style={[styles.panel, { maxWidth: readingMaxWidth }]}>
        <GlassPanel>
          <GelSegmented
            options={options}
            value={view}
            onChange={onChange}
            accessibilityLabel={t('events.view.label')}
          />
        </GlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center' },
  panel: { width: '100%' },
});
