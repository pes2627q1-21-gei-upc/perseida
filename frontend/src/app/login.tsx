import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canAccessAdmin } from '../features/admin/canAccessAdmin';
import { type CurrentUser, getCurrentUser } from '../features/auth/api/getCurrentUser';
import { signInWithGoogle } from '../features/auth/api/googleSignIn';
import { refreshSession } from '../features/auth/api/refreshToken';
import { GoogleLogo } from '../features/auth/components/GoogleLogo';
import { PerseidShower } from '../features/auth/components/PerseidShower';
import { useGoogleAuth } from '../features/auth/hooks/useGoogleAuth';
import { LOGOUT_NOTICE } from '../features/auth/hooks/useLogout';
import { isAppError } from '../shared/errors';
import { toAuthErrorMessage } from '../features/auth/strings';
import { getTokens, saveTokens } from '../features/auth/tokenStorage';
import { useTheme } from '../shared/theme';
import { GelButton, GlassPanel, SkyBackground } from '../shared/ui';

// An expired access token (401) is renewed once, so a person with a valid refresh token is not
// mistaken for one without a profile.
async function readProfile(): Promise<CurrentUser> {
  try {
    return await getCurrentUser();
  } catch (error) {
    if (!isAppError(error) || error.status !== 401) throw error;
    if (!(await refreshSession())) throw error;
    return getCurrentUser();
  }
}

// The web build is the admin panel: staff go to it, any other account to the mobile app
// (TG-77 criteri 2). If the profile cannot be read, the (app) guard decides what happens next.
async function homeRoute(): Promise<'/panel' | '/(app)'> {
  if (Platform.OS !== 'web') return '/(app)';
  try {
    const user = await readProfile();
    return canAccessAdmin(user.role) ? '/panel' : '/(app)';
  } catch {
    return '/(app)';
  }
}

/** Sign-in screen. Its memorable element is the Perseid shower over the lake. */
export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { notice: noticeParam } = useLocalSearchParams<{ notice?: string }>();
  // A sign-out that the server could not confirm sends us here with a notice param.
  const [pressedNotice, setPressedNotice] = useState<string | null>(null);
  const notice =
    pressedNotice ?? (noticeParam === LOGOUT_NOTICE ? t('auth.logoutNotConfirmed') : null);

  const { signIn, isAuthenticating } = useGoogleAuth({
    onSuccess: async (idToken) => {
      const tokens = await signInWithGoogle(idToken);
      await saveTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
      router.replace(await homeRoute());
    },
    onError: (err) => setPressedNotice(toAuthErrorMessage(err)),
    onCancel: () => {
      // Cancellation dismisses browser tab and keeps UI interactive
    },
  });

  // Android announces the live region below; iOS needs an explicit announcement.
  useEffect(() => {
    if (notice && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(notice);
  }, [notice]);

  // Route guard: if the user already has a valid session, redirect to the app (TG-43 #233)
  useEffect(() => {
    let mounted = true;
    void getTokens()
      .then(async (tokens) => {
        if (!tokens) return;
        const route = await homeRoute();
        if (mounted) router.replace(route);
      })
      .catch((error: unknown) => {
        if (mounted) {
          setPressedNotice(toAuthErrorMessage(error));
        }
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  // Launches Google OAuth2 + PKCE authorization flow
  const handleContinue = async () => {
    if (isAuthenticating) return;
    try {
      await signIn();
    } catch (error: unknown) {
      setPressedNotice(toAuthErrorMessage(error));
    }
  };

  return (
    <SkyBackground behind={<PerseidShower />}>
      <View
        className="flex-1 items-center justify-center"
        style={{
          gap: theme.spacing.lg,
          paddingTop: insets.top + theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.lg,
          paddingHorizontal: theme.spacing.md,
        }}
      >
        <Text
          accessibilityRole="header"
          style={[theme.typography.display, { color: theme.colors.text.primary }]}
        >
          {/* The name of the app is not translated (US #93). */}
          Perseida
        </Text>
        <View style={{ width: '100%', maxWidth: theme.breakpoints.phone }}>
          <GlassPanel>
            <View style={{ gap: theme.spacing.md }}>
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.text.secondary, textAlign: 'center' },
                ]}
              >
                {t('auth.tagline')}
              </Text>
              <GelButton
                label={t('auth.continueWithGoogle')}
                icon={<GoogleLogo />}
                onPress={handleContinue}
                busy={isAuthenticating}
                disabled={isAuthenticating}
              />
              {notice && (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.text.secondary, textAlign: 'center' },
                  ]}
                >
                  {notice}
                </Text>
              )}
            </View>
          </GlassPanel>
        </View>
      </View>
    </SkyBackground>
  );
}
