import { LockSimpleIcon } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Theme, touch, useTheme } from '../../../shared/theme';
import type { Achievement } from '../api/getMyAchievements';
import { CATEGORY_ICONS } from './categoryIcons';
import { useAchievementName } from './useAchievementName';

interface Props {
  achievement: Achievement;
  /** Only called for an unlocked achievement: a pending one cannot be pressed. */
  onPress: (achievement: Achievement) => void;
}

/**
 * Trophy of an achievement in the grid of the profile (TG-59). Unlocked: the icon of its category
 * with the name below, and pressing it opens the description. Pending: a grey padlock with no
 * name, no description and nothing to press; the screen reader says «Fita pendent», so it does not
 * depend on colour alone.
 */
export function AchievementTrophy({ achievement, onPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const achievementName = useAchievementName();

  if (!achievement.unlocked) {
    return (
      <View style={styles.trophy}>
        <View
          accessible
          accessibilityLabel={t('achievements.trophy.pending')}
          style={[styles.circle, styles.circlePending]}
        >
          <LockSimpleIcon
            size={theme.iconSizes.lg}
            color={theme.colors.text.secondary}
            // Stryker disable next-line StringLiteral: icon weight, visual only.
            weight="bold"
          />
        </View>
      </View>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[achievement.category];
  const name = achievementName(achievement);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint={t('achievements.trophy.openHint')}
      onPress={() => onPress(achievement)}
      style={styles.trophy}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.circle,
              styles.circleUnlocked,
              pressed && { backgroundColor: theme.colors.surface.onGlass },
            ]}
          >
            <CategoryIcon
              size={theme.iconSizes.lg}
              color={theme.colors.brand}
              // Stryker disable next-line StringLiteral: icon weight, visual only.
              weight="fill"
            />
          </View>
          <Text style={styles.name}>{name}</Text>
        </>
      )}
    </Pressable>
  );
}

// Purely visual styles from theme tokens, left out of mutation testing (convencions/testing.md).
// Stryker disable all
function createStyles({ colors, radii, spacing, typography }: Theme) {
  return StyleSheet.create({
    trophy: { alignItems: 'center', gap: spacing.xs, minWidth: touch.min },
    circle: {
      alignItems: 'center',
      justifyContent: 'center',
      width: touch.min * 1.5,
      height: touch.min * 1.5,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.surface.glassBorder,
    },
    circleUnlocked: { backgroundColor: colors.surface.glassSolid },
    circlePending: { backgroundColor: colors.surface.onGlass },
    name: { ...typography.caption, color: colors.text.primary, textAlign: 'center' },
  });
}
// Stryker restore all
