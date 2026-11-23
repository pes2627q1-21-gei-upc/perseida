import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { focusRingShadow, useTheme } from '../../../shared/theme';
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

  return (
    <View
      testID="section-ring"
      style={{
        flexGrow: 1,
        flexBasis: 240,
        borderRadius: theme.radii.lg,
        ...(focused && { boxShadow: focusRingShadow(theme.colors.focusRing) }),
      }}
    >
      <Pressable
        accessibilityRole="link"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={() => router.push(section.href)}
        // A solid surface, not glass: glass is only for floating layers, and a list of cards
        // with BlurView would go over 2-3 per screen (estetica-frutiger-cosmo checklist).
        style={{
          minHeight: theme.touch.min,
          justifyContent: 'center',
          padding: theme.spacing.md,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: theme.colors.surface.glassBorder,
          backgroundColor: theme.colors.surface.glassSolid,
        }}
      >
        <Text style={[theme.typography.title, { color: theme.colors.text.primary }]}>
          {t(section.titleKey)}
        </Text>
      </Pressable>
    </View>
  );
}

/** Home of the panel (TG-77 criteri 6): the welcome and, when there are any, a card per section. */
export function PanelHome({ sections = PANEL_SECTIONS }: { sections?: readonly PanelSection[] }) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <GlassPanel>
        <Text
          accessibilityRole="header"
          style={[theme.typography.headline, { color: theme.colors.text.primary }]}
        >
          {t('admin.home.welcome')}
        </Text>
      </GlassPanel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
        {sections.map((section) => (
          <SectionCard key={section.href} section={section} />
        ))}
      </View>
    </View>
  );
}
