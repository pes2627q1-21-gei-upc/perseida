import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { type Theme, touch, useTheme } from '../../../shared/theme';
import { GlassPanel, StatusPanel } from '../../../shared/ui';
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
  const styles = createStyles(useTheme());
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
      // On glass, not on the sky: the names stay legible over the orange of the sunset.
      <GlassPanel>
        <View style={styles.grid}>
          {data.map((achievement) => (
            <View key={achievement.code} style={styles.cell}>
              <AchievementTrophy achievement={achievement} onPress={setSelected} />
            </View>
          ))}
        </View>
      </GlassPanel>
    );
  }

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('achievements.gallery.title')}
      </Text>
      {content}
      <AchievementDialog achievement={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

// Purely visual styles from theme tokens, left out of mutation testing (convencions/testing.md).
// Stryker disable all
function createStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    section: { width: '100%', gap: spacing.md },
    title: { ...typography.title, alignSelf: 'flex-start', color: colors.text.primary },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md },
    cell: { width: touch.min * 2, alignItems: 'center' },
  });
}
// Stryker restore all
