import { LinearGradient } from 'expo-linear-gradient';
import { Moon, RocketLaunch, ShootingStar, Sun } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import type { EventCategory } from '../api/getEvents';
import { MARKER_SIZE, markerPalette } from './markerIcon';

const ICONS = { lunar: Moon, solar: Sun, meteor_shower: ShootingStar, launch: RocketLaunch };

interface Props {
  category: EventCategory;
  /** Happening now: a still ring of light (the moving halo lives only on the map). */
  active: boolean;
}

/**
 * The glass orb of a category, as on the map, with the same gloss. Decorative: the row says
 * what it is.
 */
export function EventOrb({ category, active }: Props) {
  const { colors, iconSizes } = useTheme();
  const palette = markerPalette(colors);
  const Icon = ICONS[category];
  const orb = MARKER_SIZE - 8;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, { width: MARKER_SIZE, height: MARKER_SIZE }]}
    >
      {active && (
        <View
          style={[
            styles.ring,
            { width: MARKER_SIZE, height: MARKER_SIZE, borderColor: palette.glow },
          ]}
        />
      )}
      <View
        style={[
          styles.orb,
          {
            width: orb,
            height: orb,
            backgroundColor: palette.orb,
            borderColor: palette.rim,
            boxShadow: `0 0 14px ${palette.glow}99`,
          },
        ]}
      >
        <Icon size={iconSizes.md} color={palette.icon} />
        <LinearGradient colors={palette.gloss} style={styles.gloss} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 2, opacity: 0.5 },
  orb: {
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gloss: { position: 'absolute', top: 0, left: '8%', right: '8%', height: '44%' },
});
