import { type ComponentRef, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { type EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

import { moveFocusTo } from '../../../shared/a11y/moveFocusTo';
import { focusRingShadow, type Theme, useTheme } from '../../../shared/theme';
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
  const styles = shellStyles(theme, insets);

  return (
    <SkyBackground>
      <View style={styles.root}>
        {/* First thing the keyboard reaches; invisible until it has the focus (WCAG 2.4.1). */}
        <View
          testID="skip-link-ring"
          // Hidden, the pointer goes through it to the bar; the keyboard still reaches it.
          pointerEvents={skipFocused ? 'auto' : 'none'}
          style={[
            styles.skipRing,
            {
              opacity: skipFocused ? 1 : 0,
              ...(skipFocused && { boxShadow: focusRingShadow(theme.colors.focusRing) }),
            },
          ]}
        >
          <Pressable
            accessibilityRole="link"
            onFocus={() => setSkipFocused(true)}
            onBlur={() => setSkipFocused(false)}
            onPress={() => {
              // Stryker disable next-line ConditionalExpression: the ref is set once mounted; the guard is for the type.
              if (main.current) moveFocusTo(main.current);
            }}
            style={styles.skipLink}
          >
            <Text style={styles.skipText}>{t('admin.skipToContent')}</Text>
          </Pressable>
        </View>
        <View role="banner" accessibilityLabel={t('admin.topBar.label')} style={styles.column}>
          <GlassPanel>
            <View style={styles.bar}>
              {/* The name of the app is not translated (US #93). */}
              <Text style={styles.appName}>Perseida</Text>
              <LogoutButton />
            </View>
          </GlassPanel>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View
            ref={main}
            role="main"
            accessibilityLabel={t('admin.main.label')}
            tabIndex={-1}
            style={styles.column}
          >
            {children}
          </View>
        </ScrollView>
      </View>
    </SkyBackground>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on purpose:
// a changed padding, radius or font is not behaviour a unit test should pin down
// (convencions/testing.md, «Mutation testing»). Behaviour stays in the JSX above.
// Stryker disable all
function shellStyles(theme: Theme, insets: EdgeInsets) {
  const { spacing, colors, typography } = theme;
  return {
    root: {
      flex: 1,
      paddingTop: insets.top + spacing.sm,
      paddingLeft: insets.left + spacing.md,
      paddingRight: insets.right + spacing.md,
    },
    column: {
      width: '100%',
      maxWidth: theme.breakpoints.desktop,
      alignSelf: 'center',
    },
    skipRing: {
      position: 'absolute',
      zIndex: 10,
      top: insets.top + spacing.sm,
      left: insets.left + spacing.md,
      borderRadius: theme.radii.pill,
      backgroundColor: colors.surface.glassSolid,
    },
    skipLink: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    skipText: { ...typography.bodyStrong, color: colors.text.primary },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    appName: { ...typography.title, color: colors.text.primary },
    scroll: { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg },
  } as const;
}
// Stryker restore all
