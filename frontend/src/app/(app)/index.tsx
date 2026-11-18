import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoutButton } from '../../features/auth/components/LogoutButton';
import { useTheme } from '../../shared/theme';
import { GelButton, SkyBackground } from '../../shared/ui';

/**
 * TEMPORARY home (TG-118): there is no real home screen yet, only a way into /apod, /map and /outings.
 * Replace this whole file when the home US is done; keep the links to /apod, /map (TG-52) and /outings (TG-629).
 * Its only text goes through i18next; the title is the app name.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SkyBackground>
      <View
        className="flex-1 items-center justify-center"
        style={{ gap: theme.spacing.lg, paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text
          accessibilityRole="header"
          style={[theme.typography.display, { color: theme.colors.text.primary }]}
        >
          Perseida
        </Text>
        <GelButton label={t('home.apodLink')} onPress={() => router.push('/apod')} />
        <GelButton label={t('home.mapLink')} onPress={() => router.push('/map')} />
        <GelButton label={t('home.outingsLink')} onPress={() => router.push('/outings')} />
        <LogoutButton />
      </View>
    </SkyBackground>
  );
}
