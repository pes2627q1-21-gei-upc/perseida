import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { LakeBanks, LakeWater } from './Lake';

interface Props {
  children: ReactNode;
  /**
   * Drawn over the sky and the water but under the meadow and the content: where things
   * that pass behind the hills and the grass belong (the Perseids of the sign-in screen).
   */
  behind?: ReactNode;
}

/**
 * The "Cel viu" scene (cel-viu.md): the sky gradient, the sun or the moon between the hills,
 * and a lake with its meadow. From back to front: sky, light, hills, water, `behind`, the
 * banks of the lake and, over all of it, the content of the screen. The live parts (aurora,
 * stars) are not implemented yet.
 */
export function SkyBackground({ children, behind }: Props) {
  const { colors } = useTheme();
  const sky: [string, string] = [colors.sky.top, colors.sky.low];

  return (
    <View style={styles.root}>
      <LinearGradient colors={sky} style={StyleSheet.absoluteFill} />
      <LakeWater />
      {behind}
      <LakeBanks />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
