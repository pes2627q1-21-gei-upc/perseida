import { Check, Globe } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DEFAULT_LANGUAGE,
  isLanguage,
  type Language,
  SUPPORTED_LANGUAGES,
} from '../../../shared/i18n';
import { type Theme, useTheme } from '../../../shared/theme';
import { QuietButton } from '../../../shared/ui';
import { useChangeLanguage } from '../hooks/useChangeLanguage';

/**
 * Language dropdown of the profile card (TG-92): a globe and the code of the current language
 * (ES, CA, EN); pressed, it lists the three languages by their own name. It sits at the top
 * right of the card, which draws it over the content under it while it is open.
 */
export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const [open, setOpen] = useState(false);
  const { change, retry, isSaving, error } = useChangeLanguage();

  const current: Language = isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const code = current.toUpperCase();

  const choose = (language: Language) => {
    setOpen(false);
    if (language === current) return;
    change(language);
    // The label of the button changes, but nothing tells the screen reader: announce it in
    // the new language.
    AccessibilityInfo.announceForAccessibility(
      t('profile.languageMenu.changed', {
        lng: language,
        name: t(`profile.language.${language}`, { lng: language }),
      }),
    );
  };

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.languageMenu.label', {
          code,
          name: t(`profile.language.${current}`),
        })}
        accessibilityHint={t('profile.languageMenu.hint')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((wasOpen) => !wasOpen)}
        style={styles.button}
      >
        <Globe size={theme.iconSizes.sm} color={theme.colors.text.primary} />
        <Text style={styles.code}>{code}</Text>
      </Pressable>

      {open && (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('profile.languageMenu.title')}
          style={styles.list}
        >
          {SUPPORTED_LANGUAGES.map((language) => {
            const selected = language === current;
            return (
              <Pressable
                key={language}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => choose(language)}
                style={styles.option}
              >
                <Text style={selected ? styles.optionSelected : styles.optionText}>
                  {t(`profile.language.${language}`)}
                </Text>
                {selected && (
                  <Check
                    size={theme.iconSizes.sm}
                    color={theme.colors.brand}
                    // Stryker disable next-line StringLiteral: icon weight, visual only.
                    weight="bold"
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {isSaving && (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {t('profile.languageMenu.saving')}
        </Text>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.status}>
            {t('profile.languageMenu.error')}
          </Text>
          <QuietButton label={t('profile.retry')} onPress={retry} />
        </View>
      )}
    </View>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose (convencions/testing.md, «Mutation testing»); behaviour stays in the JSX above.
// Stryker disable all
function createStyles({ colors, radii, spacing, typography, touch }: Theme) {
  const solidGlass = {
    borderWidth: 1,
    borderColor: colors.surface.glassBorder,
    backgroundColor: colors.surface.glassSolid,
  };

  return StyleSheet.create({
    root: {
      position: 'absolute',
      top: 0,
      right: 0,
      zIndex: 1,
      maxWidth: 220,
      alignItems: 'flex-end',
      gap: spacing.xs,
    },
    button: {
      ...solidGlass,
      minHeight: touch.min,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
    },
    code: { ...typography.bodyStrong, color: colors.text.primary },
    list: { ...solidGlass, borderRadius: radii.lg, overflow: 'hidden', minWidth: 160 },
    option: {
      minHeight: touch.min,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
    },
    optionText: { ...typography.body, color: colors.text.primary },
    optionSelected: { ...typography.bodyStrong, color: colors.brand },
    status: {
      ...solidGlass,
      ...typography.caption,
      color: colors.text.primary,
      padding: spacing.sm,
      borderRadius: radii.md,
      overflow: 'hidden',
    },
    errorBox: { alignItems: 'flex-end', gap: spacing.xs },
  });
}
// Stryker restore all
