import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { readingMaxWidth, type Theme, touch, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel, QuietButton } from '../../../shared/ui';
import type { Achievement } from '../api/getMyAchievements';
import { shareAchievement } from '../share/shareAchievement';
import { CATEGORY_ICONS } from './categoryIcons';
import { useAchievementDescription } from './useAchievementDescription';
import { useAchievementName } from './useAchievementName';

interface Props {
  /** The unlocked achievement to show; without one the dialog is closed. */
  achievement: Achievement | null;
  onClose: () => void;
}

/**
 * Window over the profile with the trophy of an unlocked achievement: its image, its name, its
 * description and the button to share it (TG-59). A Modal, like ConfirmDialog, so it works on
 * every platform: the focus goes into it, and the back button or Escape close it.
 */
export function AchievementDialog({ achievement, onClose }: Props) {
  const { colors, spacing } = useTheme();

  return (
    <Modal
      testID="achievement-dialog-modal"
      visible={achievement !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        accessibilityViewIsModal
        style={[styles.veil, { backgroundColor: colors.surface.scrim, padding: spacing.md }]}
      >
        <View style={[styles.panel, { maxWidth: readingMaxWidth }]}>
          {/* Keyed by code: the error of one achievement never follows the next one. */}
          {achievement ? (
            <DialogContent key={achievement.code} achievement={achievement} onClose={onClose} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function DialogContent({
  achievement,
  onClose,
}: {
  achievement: Achievement;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const achievementName = useAchievementName();
  const achievementDescription = useAchievementDescription();
  const [sharing, setSharing] = useState(false);
  const [failed, setFailed] = useState(false);
  const CategoryIcon = CATEGORY_ICONS[achievement.category];
  const name = achievementName(achievement);

  const share = async () => {
    setSharing(true);
    setFailed(false);
    try {
      await shareAchievement(name, t);
    } catch {
      // shareAchievement only throws SHARE_FAILED; closing the menu is not an error.
      setFailed(true);
    } finally {
      setSharing(false);
    }
  };

  return (
    <GlassPanel>
      <View style={styles.content}>
        <View
          // Decorative: the name below already identifies the trophy (WCAG 1.1.1).
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.trophy}
        >
          <CategoryIcon
            size={theme.iconSizes.lg * 1.5}
            color={theme.colors.brand}
            // Stryker disable next-line StringLiteral: icon weight, visual only.
            weight="fill"
          />
        </View>
        <Text accessibilityRole="header" style={styles.name}>
          {name}
        </Text>
        <Text style={styles.description}>{achievementDescription(achievement)}</Text>
        {failed ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
            {errorMessage(t, 'SHARE_FAILED', false)}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <QuietButton label={t('achievements.dialog.close')} onPress={onClose} />
          <GelButton
            label={t('achievements.dialog.share')}
            accessibilityHint={t('achievements.dialog.shareHint', { name })}
            busy={sharing}
            onPress={() => void share()}
          />
        </View>
      </View>
    </GlassPanel>
  );
}

// Layout of the veil and the panel, as in ConfirmDialog.
// Stryker disable all
const styles = StyleSheet.create({
  veil: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%' },
});

// Purely visual styles from theme tokens, left out of mutation testing (convencions/testing.md).
function createStyles({ colors, radii, spacing, typography }: Theme) {
  return StyleSheet.create({
    content: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    trophy: {
      alignItems: 'center',
      justifyContent: 'center',
      width: touch.min * 2,
      height: touch.min * 2,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.glassSolid,
    },
    name: { ...typography.title, color: colors.text.primary, textAlign: 'center' },
    description: { ...typography.body, color: colors.text.primary, textAlign: 'center' },
    error: { ...typography.body, color: colors.text.primary, textAlign: 'center' },
    actions: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
  });
}
// Stryker restore all
