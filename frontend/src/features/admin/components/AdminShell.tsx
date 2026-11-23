import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../shared/theme';
import { GlassPanel, SkyBackground } from '../../../shared/ui';
import { LogoutButton } from '../../auth/components/LogoutButton';

/**
 * Frame of every page of the admin panel (TG-77 criteri 6): the sky scene, a glass top bar with
 * the name of the app and the sign-out button, and the page under it. Made for a laptop: the
 * content keeps to the desktop width and scrolls when the window is short.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const column = {
    width: '100%',
    maxWidth: theme.breakpoints.desktop,
    alignSelf: 'center',
  } as const;

  return (
    <SkyBackground>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + theme.spacing.sm,
          paddingLeft: insets.left + theme.spacing.md,
          paddingRight: insets.right + theme.spacing.md,
        }}
      >
        <View style={column}>
          <GlassPanel>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
              }}
            >
              {/* The name of the app is not translated (US #93). */}
              <Text style={[theme.typography.title, { color: theme.colors.text.primary }]}>
                Perseida
              </Text>
              <LogoutButton />
            </View>
          </GlassPanel>
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingTop: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.lg,
          }}
        >
          <View style={column}>{children}</View>
        </ScrollView>
      </View>
    </SkyBackground>
  );
}
