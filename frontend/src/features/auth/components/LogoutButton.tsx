import { SignOut } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { QuietButton } from '../../../shared/ui';
import { useLogout } from '../hooks/useLogout';

/** Secondary action: signs the user out and goes back to the sign-in screen. */
export function LogoutButton() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { mutate, isPending } = useLogout();

  return (
    <QuietButton
      label={t('auth.logout')}
      accessibilityHint={t('auth.logoutHint')}
      busy={isPending}
      onPress={() => mutate()}
      icon={
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SignOut size={theme.iconSizes.md} color={theme.colors.text.primary} />
        </View>
      }
    />
  );
}
