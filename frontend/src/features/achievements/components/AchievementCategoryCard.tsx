import type { Icon } from 'phosphor-react-native';
import {
  CalendarStarIcon,
  FlameIcon,
  GameControllerIcon,
  QuestionIcon,
  UsersThreeIcon,
} from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { type Theme, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { AchievementCategory } from '../api/getMyAchievements';
import type { CategoryProgress } from '../model/categoryProgress';
import { AchievementProgressBar } from './AchievementProgressBar';
import { useAchievementName } from './useAchievementName';

const CATEGORY_ICONS: Record<AchievementCategory, Icon> = {
  streaks: FlameIcon,
  quiz: QuestionIcon,
  events: CalendarStarIcon,
  social: UsersThreeIcon,
  minigame: GameControllerIcon,
};

/**
 * Card of one category of achievements on the profile (TG-57 criterion 2): its icon, the
 * achievement the user is going for and a bar with the progress. A finished category keeps the
 * bar full with a congratulation; a streak at 0 invites to start (criterion 3).
 */
export function AchievementCategoryCard({ entry }: { entry: CategoryProgress }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const achievementName = useAchievementName();
  const CategoryIcon = CATEGORY_ICONS[entry.category];
  const { achievement, completed } = entry;

  const categoryName = t(`achievements.category.${entry.category}`);
  const name = achievement ? achievementName(achievement) : '';
  const current = achievement ? Math.min(Math.max(achievement.current, 0), achievement.goal) : 0;
  const goal = achievement?.goal ?? 0;
  const progressText =
    entry.category === 'streaks'
      ? t('achievements.progressDays', { current, count: goal })
      : t('achievements.progress', { current, goal });

  let hint: string | null = null;
  if (completed) hint = t('achievements.completed');
  else if (entry.category === 'streaks' && current === 0) hint = t('achievements.streakStart');

  return (
    <GlassPanel>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.icon}>
            <CategoryIcon
              size={theme.iconSizes.sm}
              color={theme.colors.brand}
              // Stryker disable next-line StringLiteral: icon weight, visual only.
              weight="fill"
            />
          </View>
          <View style={styles.titles}>
            <Text accessibilityRole="header" style={styles.category}>
              {categoryName}
            </Text>
            {achievement ? <Text style={styles.name}>{name}</Text> : null}
          </View>
          {achievement ? <Text style={styles.count}>{progressText}</Text> : null}
        </View>

        {achievement ? (
          <AchievementProgressBar
            current={current}
            goal={goal}
            accessibilityLabel={t('achievements.progressA11y', { name, current, goal })}
          />
        ) : (
          <Text style={styles.hint}>{t('achievements.empty')}</Text>
        )}

        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </GlassPanel>
  );
}

// Purely visual styles from theme tokens, left out of mutation testing (convencions/testing.md).
// Stryker disable all
function createStyles({ colors, radii, spacing, typography, iconSizes }: Theme) {
  return StyleSheet.create({
    card: { gap: spacing.sm, paddingVertical: spacing.xs },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    icon: {
      alignItems: 'center',
      justifyContent: 'center',
      width: iconSizes.sm * 2,
      height: iconSizes.sm * 2,
      borderRadius: radii.pill,
      backgroundColor: colors.surface.glassSolid,
    },
    titles: { flex: 1, gap: 2 },
    category: { ...typography.caption, color: colors.text.secondary },
    name: { ...typography.bodyStrong, color: colors.text.primary },
    count: { ...typography.caption, color: colors.text.primary },
    hint: { ...typography.caption, color: colors.text.secondary },
  });
}
// Stryker restore all
