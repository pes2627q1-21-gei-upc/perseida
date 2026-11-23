import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../../shared/theme';

interface Props {
  current: number;
  goal: number;
  /** What the screen reader says, e.g. «Lluna plena, 8 de 14». */
  accessibilityLabel: string;
}

/**
 * Completion bar of an achievement. The progress comes from the API (TG-58): the bar only draws
 * it, never above the goal. Shared by the progress cards (TG-57) and the achievement rows (TG-59).
 */
export function AchievementProgressBar({ current, goal, accessibilityLabel }: Props) {
  const { colors, radii } = useTheme();
  const safeGoal = Math.max(goal, 1);
  const now = Math.min(Math.max(current, 0), safeGoal);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: safeGoal, now }}
      style={[
        styles.track,
        {
          borderRadius: radii.pill,
          backgroundColor: colors.surface.onGlass,
          borderColor: colors.surface.glassBorder,
        },
      ]}
    >
      <View
        testID="achievement-progress-fill"
        style={[
          styles.fill,
          {
            width: `${(now / safeGoal) * 100}%`,
            borderRadius: radii.pill,
            backgroundColor: colors.brandFill,
          },
        ]}
      />
    </View>
  );
}

// Stryker disable all: visual sizes only.
const styles = StyleSheet.create({
  track: { height: 10, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%' },
});
// Stryker restore all
