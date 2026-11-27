import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { type EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Theme, useTheme } from '../../../shared/theme';
import { GlassPanel, SkyBackground } from '../../../shared/ui';
import { LogoutButton } from '../../auth/components/LogoutButton';

/** Shown to an account that is not an admin or a moderator: it can only sign out (TG-77 #3). */
export function NoAccessScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [announced, setAnnounced] = useState(false);
  const styles = noAccessStyles(theme, insets);

  // On the next tick, once the empty region is in place, so the change is announced.
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(true), 0);
    return () => clearTimeout(timer);
    // Stryker disable next-line ArrayDeclaration: it runs once either way; a dependency would not change it.
  }, []);

  return (
    <SkyBackground>
      <View className="flex-1 items-center justify-center" style={styles.screen}>
        <View style={styles.column}>
          <GlassPanel>
            <View style={styles.content}>
              <Text accessibilityRole="header" style={styles.title}>
                {t('admin.noAccess.title')}
              </Text>
              {/* A screen reader only announces a change inside a live region that already
                  existed: the region mounts empty and the message comes in right after. */}
              <View
                testID="no-access-live-region"
                accessibilityLiveRegion="polite"
                aria-live="polite"
              >
                {announced && <Text style={styles.message}>{t('admin.noAccess.message')}</Text>}
              </View>
              <LogoutButton />
            </View>
          </GlassPanel>
        </View>
      </View>
    </SkyBackground>
  );
}

// Purely visual styles, left out of mutation testing on purpose (convencions/testing.md).
// Stryker disable all
function noAccessStyles(theme: Theme, insets: EdgeInsets) {
  const { spacing, colors, typography } = theme;
  return {
    screen: {
      paddingTop: insets.top + spacing.lg,
      paddingBottom: insets.bottom + spacing.lg,
      paddingHorizontal: spacing.md,
    },
    column: { width: '100%', maxWidth: theme.breakpoints.phone },
    content: { gap: spacing.md },
    title: { ...typography.title, color: colors.text.primary },
    message: { ...typography.body, color: colors.text.secondary },
  } as const;
}
// Stryker restore all
