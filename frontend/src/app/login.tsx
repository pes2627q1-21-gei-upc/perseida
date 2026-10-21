import { useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoogleOrb } from '../features/auth/components/GoogleOrb';
import { PerseidShower } from '../features/auth/components/PerseidShower';
import { authStrings } from '../features/auth/strings';
import { useTheme } from '../shared/theme';
import { GelButton, GlassPanel, SkyBackground } from '../shared/ui';

/** Sign-in screen. Its memorable element is the Perseid shower over the lake. */
export default function LoginScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<string | null>(null);

  // TEMPORARY: US #43 replaces this body with the Google OAuth2 + PKCE flow, saves the
  // tokens with saveTokens (features/auth/tokenStorage) and navigates to the app.
  const handleContinue = () => {
    setNotice(authStrings.loginUnavailable);
    AccessibilityInfo.announceForAccessibility(authStrings.loginUnavailable);
  };

  return (
    <SkyBackground>
      <PerseidShower />
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
                icon={<GoogleOrb />}
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
