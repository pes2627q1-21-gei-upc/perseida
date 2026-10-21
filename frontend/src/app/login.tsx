import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoogleLogo } from '../features/auth/components/GoogleLogo';
import { PerseidShower } from '../features/auth/components/PerseidShower';
import { LOGOUT_NOTICE } from '../features/auth/hooks/useLogout';
import { authStrings } from '../features/auth/strings';
import { useTheme } from '../shared/theme';
import { GelButton, GlassPanel, SkyBackground } from '../shared/ui';

/** Sign-in screen. Its memorable element is the Perseid shower over the lake. */
export default function LoginScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { notice: noticeParam } = useLocalSearchParams<{ notice?: string }>();
  // A sign-out that the server could not confirm sends us here with a notice param.
  const [pressedNotice, setPressedNotice] = useState<string | null>(null);
  const notice =
    pressedNotice ?? (noticeParam === LOGOUT_NOTICE ? authStrings.logoutNotConfirmed : null);

  // Android announces the live region below; iOS needs an explicit announcement.
  useEffect(() => {
    if (notice && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(notice);
  }, [notice]);

  // TEMPORARY: US #43 replaces this body with the Google OAuth2 + PKCE flow, saves the
  // tokens with saveTokens (features/auth/tokenStorage) and navigates to the app.
  const handleContinue = () => setPressedNotice(authStrings.loginUnavailable);

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
          {authStrings.appName}
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
                {authStrings.tagline}
              </Text>
              <GelButton
                label={authStrings.continueWithGoogle}
                icon={<GoogleLogo />}
                onPress={handleContinue}
              />
              {notice && (
                <Text
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
