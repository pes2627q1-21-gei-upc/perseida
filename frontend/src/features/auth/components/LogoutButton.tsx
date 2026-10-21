import { SignOut } from 'phosphor-react-native';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import { useLogout } from '../hooks/useLogout';
import { authStrings } from '../strings';

/** Secondary action (glass, not gel): signs the user out and goes back to the sign-in screen. */
export function LogoutButton() {
  const theme = useTheme();
  const { mutate, isPending } = useLogout();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={authStrings.logout}
      accessibilityHint={authStrings.logoutHint}
      accessibilityState={{ disabled: isPending, busy: isPending }}
      disabled={isPending}
      onPress={() => mutate()}
      style={{ minHeight: theme.touch.min, opacity: isPending ? 0.6 : 1 }}
    >
      <GlassPanel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SignOut size={theme.iconSizes.md} color={theme.colors.text.primary} />
          </View>
          <Text style={[theme.typography.bodyStrong, { color: theme.colors.text.primary }]}>
            {authStrings.logout}
          </Text>
        </View>
      </GlassPanel>
    </Pressable>
  );
}
