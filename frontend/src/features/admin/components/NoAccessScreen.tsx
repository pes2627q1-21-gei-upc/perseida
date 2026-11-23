import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../shared/theme';
import { GlassPanel, SkyBackground } from '../../../shared/ui';
import { LogoutButton } from '../../auth/components/LogoutButton';

/** Shown to an account that is not an admin or a moderator: it can only sign out (TG-77 #3). */
export function NoAccessScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SkyBackground>
      <View
        className="flex-1 items-center justify-center"
        style={{
          paddingTop: insets.top + theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.lg,
          paddingHorizontal: theme.spacing.md,
        }}
      >
        <View style={{ width: '100%', maxWidth: theme.breakpoints.phone }}>
          <GlassPanel>
            <View style={{ gap: theme.spacing.md }}>
              <Text
                accessibilityRole="header"
                style={[theme.typography.title, { color: theme.colors.text.primary }]}
              >
                {t('admin.noAccess.title')}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                style={[theme.typography.body, { color: theme.colors.text.secondary }]}
              >
                {t('admin.noAccess.message')}
              </Text>
              <LogoutButton />
            </View>
          </GlassPanel>
        </View>
      </View>
    </SkyBackground>
  );
}
