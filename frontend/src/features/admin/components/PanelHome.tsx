import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import { PANEL_SECTIONS, type PanelSection } from '../panelSections';

/** One card of the home: a link to its section, with a focus ring for the keyboard (WCAG 2.4.7). */
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
        ...(focused && { boxShadow: `0 0 0 3px ${theme.colors.focusRing}` }),
      }}
    >
      <Pressable
        accessibilityRole="link"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={() => router.push(section.href)}
        style={{ minHeight: theme.touch.min }}
      >
        <GlassPanel>
          <Text style={[theme.typography.title, { color: theme.colors.text.primary }]}>
            {t(section.titleKey)}
          </Text>
        </GlassPanel>
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
