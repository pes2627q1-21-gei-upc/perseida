import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { touch, useTheme } from '../../../shared/theme';
import { StatusPanel } from '../../../shared/ui';
import type { Achievement } from '../api/getMyAchievements';
import { useMyAchievements } from '../hooks/useMyAchievements';
import { AchievementDialog } from './AchievementDialog';
import { AchievementTrophy } from './AchievementTrophy';

/**
 * The badges of the profile (TG-59): a grid with one trophy per achievement of the catalogue,
 * in colour the ones the user has unlocked and as a grey padlock the ones still pending.
 * Pressing an unlocked trophy opens its window, where it can be shared. It only reads the
 * achievements; the progress is computed by the server (TG-58).
 */
export function AchievementsSection() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const { data, isLoading, isError, error, refetch } = useMyAchievements();
  const [selected, setSelected] = useState<Achievement | null>(null);
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
    content = (
      <View style={[styles.grid, { gap: spacing.md }]}>
        {data.map((achievement) => (
          <View key={achievement.code} style={styles.cell}>
            <AchievementTrophy achievement={achievement} onPress={setSelected} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.section, { gap: spacing.md }]}>
      <Text
        accessibilityRole="header"
        style={[typography.title, styles.title, { color: colors.text.primary }]}
      >
        {t('achievements.gallery.title')}
      </Text>
      {content}
      <AchievementDialog achievement={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

// Stryker disable all: layout only.
const styles = StyleSheet.create({
  section: { width: '100%' },
  title: { alignSelf: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  cell: { width: touch.min * 2, alignItems: 'center' },
});
// Stryker restore all
