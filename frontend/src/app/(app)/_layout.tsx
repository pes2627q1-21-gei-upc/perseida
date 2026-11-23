import { BlurView } from 'expo-blur';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
 * - Sub-routes (map, apod) hidden from the bar with tabBarButton: () => null. Not href: null,
 *   which in expo-router 58 removes the route and sends router.push('/map') back home.
 */
function accessibleName(title: string, short: string | undefined): string {
  return short && short !== title ? `${short}, ${title}` : title;
}

export default function AppLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceTransparency = useReduceTransparency();
  const insets = useSafeAreaInsets();
  // In the room of an event the composer takes the bottom of the screen: no tab bar there.
  const segments: string[] = useSegments();
  const inChatRoom =
    segments[1] === 'chat' &&
    (segments[2] === '[eventId]' ||
      (segments[2] === 'direct' && segments[3] === '[conversationId]'));
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
        // Labels always below the icon: beside it, a phone in landscape cuts «Gamificació».
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          ...TAB_BAR_FRAME,
          // The default 49 dp cuts the caption label: room for a 48 dp target plus its label.
          height: theme.touch.min + theme.typography.caption.lineHeight + insets.bottom,
          backgroundColor: reduceTransparency
            ? theme.colors.surface.glassSolid
            : theme.colors.surface.glass,
          borderTopColor: theme.colors.surface.glassBorder,
          ...(inChatRoom && { display: 'none' }),
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
              // The bar shows the short label where the title does not fit. The accessible name
              // starts with the visible text and adds the full one (WCAG 2.5.3 Label in Name);
              // when both read the same it is not repeated.
              tabBarLabel: t(item.shortTitleKey ?? item.titleKey),
              tabBarAccessibilityLabel: accessibleName(
                t(item.titleKey),
                item.shortTitleKey && t(item.shortTitleKey),
              ),
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
            tabBarButton: () => null,
            // The item wrapper keeps a flex: 1 slot even with no button: drop it too.
            tabBarItemStyle: { display: 'none' },
            tabBarStyle: { display: 'none' },
          }}
        />
      ))}
    </Tabs>
  );
}
