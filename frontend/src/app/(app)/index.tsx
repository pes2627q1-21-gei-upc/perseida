import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../shared/theme';
import { GelButton, SkyBackground } from '../../shared/ui';

/**
 * TEMPORARY home (TG-118): there is no real home screen yet, only a way into /apod.
 * Replace this whole file when the home US is done; keep a link to /apod.
 * Its texts are placeholders and are not meant to be translated.
 */
export default function HomeScreen() {
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
        <GelButton label="APOD del dia" onPress={() => router.push('/apod')} />
      </View>
    </SkyBackground>
  );
}
