import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import { PANEL_SECTIONS, type PanelSection } from '../panelSections';

/** Home of the panel (TG-77 criteri 6): the welcome and, when there are any, a card per section. */
export function PanelHome({ sections = PANEL_SECTIONS }: { sections?: readonly PanelSection[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

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
          <Pressable
            key={section.href}
            accessibilityRole="link"
            onPress={() => router.push(section.href)}
            style={{ flexGrow: 1, flexBasis: 240, minHeight: theme.touch.min }}
          >
            <GlassPanel>
              <Text style={[theme.typography.title, { color: theme.colors.text.primary }]}>
                {t(section.titleKey)}
              </Text>
            </GlassPanel>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
