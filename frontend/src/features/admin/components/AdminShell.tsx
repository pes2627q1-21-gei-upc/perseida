import { type ComponentRef, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { moveFocusTo } from '../../../shared/a11y/moveFocusTo';
import { useTheme } from '../../../shared/theme';
import { GlassPanel, SkyBackground } from '../../../shared/ui';
import { LogoutButton } from '../../auth/components/LogoutButton';

/**
 * Frame of every page of the admin panel (TG-77 criteri 6): the sky scene, a glass top bar with
 * the name of the app and the sign-out button, and the page under it. Made for a laptop: the
 * content keeps to the desktop width and scrolls when the window is short. For the keyboard and
 * the screen reader (criteri 8): a link to skip the bar, and the bar and the page as regions.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const main = useRef<ComponentRef<typeof View>>(null);
  const [skipFocused, setSkipFocused] = useState(false);
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
        {/* First thing the keyboard reaches; invisible until it has the focus (WCAG 2.4.1). */}
        <View
          testID="skip-link-ring"
          // Hidden, the pointer goes through it to the bar; the keyboard still reaches it.
          pointerEvents={skipFocused ? 'auto' : 'none'}
          style={{
            position: 'absolute',
            zIndex: 10,
            top: insets.top + theme.spacing.sm,
            left: insets.left + theme.spacing.md,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.surface.glassSolid,
            opacity: skipFocused ? 1 : 0,
            ...(skipFocused && { boxShadow: `0 0 0 3px ${theme.colors.focusRing}` }),
          }}
        >
          <Pressable
            accessibilityRole="link"
            onFocus={() => setSkipFocused(true)}
            onBlur={() => setSkipFocused(false)}
            onPress={() => {
              if (main.current) moveFocusTo(main.current);
            }}
            style={{
              minHeight: theme.touch.min,
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.md,
            }}
          >
            <Text style={[theme.typography.bodyStrong, { color: theme.colors.text.primary }]}>
              {t('admin.skipToContent')}
            </Text>
          </Pressable>
        </View>
        <View role="banner" accessibilityLabel={t('admin.topBar.label')} style={column}>
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
          <View
            ref={main}
            role="main"
            accessibilityLabel={t('admin.main.label')}
            tabIndex={-1}
            style={column}
          >
            {children}
          </View>
        </ScrollView>
      </View>
    </SkyBackground>
  );
}
