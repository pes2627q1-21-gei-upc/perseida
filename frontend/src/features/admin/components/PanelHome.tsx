import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { focusRingShadow, type Theme, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import { PANEL_SECTIONS, type PanelSection } from '../panelSections';

/**
 * One card of the home: a link to its section on a solid surface, with a focus ring for the
 * keyboard (WCAG 2.4.7).
 */
function SectionCard({ section }: { section: PanelSection }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const styles = homeStyles(theme);

  return (
    <View
      testID="section-ring"
      style={[styles.cardRing, focused && { boxShadow: focusRingShadow(theme.colors.focusRing) }]}
    >
      <Pressable
        accessibilityRole="link"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={() => router.push(section.href)}
        // A solid surface, not glass: glass is only for floating layers, and a list of cards
        // with BlurView would go over 2-3 per screen (estetica-frutiger-cosmo checklist).
        style={styles.card}
      >
        <Text style={styles.cardTitle}>{t(section.titleKey)}</Text>
      </Pressable>
    </View>
  );
}

/** Home of the panel (TG-77 criteri 6): the welcome and, when there are any, a card per section. */
export function PanelHome({ sections = PANEL_SECTIONS }: { sections?: readonly PanelSection[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = homeStyles(theme);

  return (
    <View style={styles.page}>
      <GlassPanel>
        <Text accessibilityRole="header" style={styles.welcome}>
          {t('admin.home.welcome')}
        </Text>
      </GlassPanel>
      <View style={styles.cards}>
        {sections.map((section) => (
          <SectionCard key={section.href} section={section} />
        ))}
      </View>
    </View>
  );
}

// Purely visual styles, left out of mutation testing on purpose (convencions/testing.md).
// Stryker disable all
function homeStyles(theme: Theme) {
  const { spacing, colors, typography, radii } = theme;
  return {
    page: { gap: spacing.lg },
    welcome: { ...typography.headline, color: colors.text.primary },
    cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    cardRing: { flexGrow: 1, flexBasis: 240, borderRadius: radii.lg },
    card: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.glassSolid,
    },
    cardTitle: { ...typography.title, color: colors.text.primary },
  } as const;
}
// Stryker restore all
