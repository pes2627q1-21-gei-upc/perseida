import { CaretLeft, ListBullets, MapTrifold } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GelSegmented, GlassPanel, type SegmentOption } from '../../../shared/ui';

export type EventsView = 'map' | 'list';

interface Props {
  view: EventsView;
  onViewChange: (view: EventsView) => void;
  onBack: () => void;
  /** Reports the height the bar covers from the top, so the list can start under it. */
  onLayout?: (bottom: number) => void;
}

/**
 * Floating glass bar of the events map (TG-52): back, screen title and the Map | List switch.
 * It floats over the map, so it is the only glass layer of the map view.
 */
export function MapTopBar({ view, onViewChange, onBack, onLayout }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { text, surface } = theme.colors;

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

  function reportLayout(event: LayoutChangeEvent) {
    const { y, height } = event.nativeEvent.layout;
    onLayout?.(y + height);
  }

  return (
    // Pinned to both edges with the margins as padding: never a width of 100 % plus an offset,
    // which pushed the bar out of the screen on the right.
    <View
      testID="map-top-bar"
      pointerEvents="box-none"
      onLayout={reportLayout}
      style={[
        styles.bar,
        {
          top: insets.top + theme.spacing.sm,
          paddingLeft: insets.left + theme.spacing.md,
          paddingRight: insets.right + theme.spacing.md,
        },
      ]}
    >
      <View testID="map-top-bar-panel" style={[styles.panel, { maxWidth: readingMaxWidth }]}>
        <GlassPanel>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={[styles.titleRow, { gap: theme.spacing.sm }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                onPress={onBack}
                style={({ pressed }) => ({
                  width: theme.touch.min,
                  height: theme.touch.min,
                  borderRadius: theme.radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? surface.glass : 'transparent',
                })}
              >
                <CaretLeft size={theme.iconSizes.md} color={text.primary} />
              </Pressable>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={[theme.typography.title, styles.title, { color: text.primary }]}
              >
                {t('events.map.title')}
              </Text>
            </View>
            <GelSegmented
              options={options}
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
  bar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  panel: { width: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});
