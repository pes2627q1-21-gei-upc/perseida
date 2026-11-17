import { BlurView } from 'expo-blur';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { refreshSession } from '../../features/auth/api/refreshToken';
import { getTokens } from '../../features/auth/tokenStorage';
import { HIDDEN_ROUTES, TAB_CONFIG } from '../../features/navigation/navigationConfig';
import { useTheme } from '../../shared/theme';
import { useReduceTransparency } from '../../shared/ui';

/** Periodically renew tokens before the 15-minute access token expires (TG-43 #233). */
export const SESSION_REFRESH_INTERVAL_MS = 14 * 60 * 1000;

// Floating glass bar over the scene: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»). Screens keep clear of it with useTabBarInset.
// Stryker disable all
const TAB_BAR_FRAME = { position: 'absolute', borderTopWidth: 1, elevation: 0 } as const;
// Stryker restore all

/**
 * Mobile app group (ADR-0020).
 * Route guard & session restoration (TG-43 #233):
 * - Checks session on startup and renews tokens via POST /api/auth/refresh.
 * - Redirects unauthenticated users to /login if tokens are missing or invalid (401).
 * - Periodically renews tokens while inside the app to prevent access token expiry.
 * Navigation tab skeleton (TG-385 #388):
 * - 5 main tabs (Inici, Esdeveniments, Xat, Gamificació, Perfil).
 * - Frutiger Cosmo floating glass tab bar.
 * - Sub-routes (map, apod) hidden from bottom navigation via href: null.
 */
export default function AppLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceTransparency = useReduceTransparency();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const tokens = await getTokens();
        if (!mounted) return;
        if (!tokens) {
          router.replace('/login');
          return;
        }

        // Renew session on startup (TG-43 #233)
        // If refresh token is expired or revoked (401), clearSession() clears local tokens
        await refreshSession();
        if (!mounted) return;

        const currentTokens = await getTokens();
        if (!mounted) return;
        if (!currentTokens) {
          router.replace('/login');
        } else {
          setIsReady(true);
        }
      } catch {
        if (mounted) {
          router.replace('/login');
        }
      }
    }

    void checkSession();

    async function renewSession() {
      try {
        const tokens = await getTokens();
        if (!mounted || !tokens) return;
        const renewed = await refreshSession();
        if (!mounted || renewed) return;
        const currentTokens = await getTokens();
        if (!mounted) return;
        if (!currentTokens) {
          router.replace('/login');
        }
      } catch {
        // A transient failure must not invalidate the session; retry at the next interval.
      }
    }

    const interval = setInterval(() => {
      void renewSession();
    }, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isReady) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.text.secondary,
        tabBarStyle: {
          ...TAB_BAR_FRAME,
          backgroundColor: reduceTransparency
            ? theme.colors.surface.glassSolid
            : theme.colors.surface.glass,
          borderTopColor: theme.colors.surface.glassBorder,
        },
        tabBarBackground: () =>
          !reduceTransparency ? (
            <BlurView
              intensity={theme.blur.glassLight}
              tint={theme.name === 'dia' ? 'light' : 'dark'}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        // WCAG 2.5.8: 48 dp touch target, also when the bar turns compact in landscape (32 dp).
        tabBarItemStyle: { minHeight: theme.touch.min },
        tabBarLabelStyle: theme.typography.caption,
      }}
    >
      {TAB_CONFIG.map((item) => {
        const IconComponent = item.icon;
        return (
          <Tabs.Screen
            key={item.name}
            name={item.name}
            options={{
              title: t(item.titleKey),
              tabBarAccessibilityLabel: t(item.titleKey),
              tabBarButtonTestID: item.testID,
              tabBarIcon: ({ color, focused, size }) => (
                <IconComponent
                  size={size ?? 24}
                  color={typeof color === 'string' ? color : theme.colors.brand}
                  weight={focused ? 'fill' : 'regular'}
                />
              ),
            }}
          />
        );
      })}

      {HIDDEN_ROUTES.map((route) => (
        <Tabs.Screen
          key={route}
          name={route}
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
      ))}
    </Tabs>
  );
}
