import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { StatusPanel } from '../../../shared/ui';
import { useMyAchievements } from '../hooks/useMyAchievements';
import { categoryProgress } from '../model/categoryProgress';
import { AchievementCategoryCard } from './AchievementCategoryCard';

/**
 * Progress towards the next achievement of each category, in the space the profile reserves for
 * the streak (TG-385, TG-57). It only reads the achievements; it never records activity.
 */
export function AchievementProgressSection() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const { data, isLoading, isError, error, refetch } = useMyAchievements();
  const texts = {
    loadingLabel: t('achievements.loading'),
    retry: t('achievements.retry'),
    retryHint: t('achievements.retryHint'),
  };

  let content;
  if (isLoading) {
    content = <StatusPanel state="loading" texts={texts} />;
  } else if (isError || !data) {
    const code = error?.code ?? 'INTERNAL_ERROR';
    content = (
      <StatusPanel
        state="error"
        code={code}
        texts={texts}
        onRetry={error?.retryable === false ? undefined : () => void refetch()}
      />
    );
  } else {
    content = categoryProgress(data).map((entry) => (
      <AchievementCategoryCard key={entry.category} entry={entry} />
    ));
  }

  return (
    <View style={[styles.section, { gap: spacing.md }]}>
      <Text
        accessibilityRole="header"
        style={[typography.title, styles.title, { color: colors.text.primary }]}
      >
        {t('achievements.title')}
      </Text>
      {content}
    </View>
  );
}

// Stryker disable all: layout only.
const styles = StyleSheet.create({
  section: { width: '100%' },
  title: { alignSelf: 'flex-start' },
});
// Stryker restore all
