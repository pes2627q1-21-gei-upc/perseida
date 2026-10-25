import '../../global.css';

import {
  MPLUSRounded1c_500Medium,
  MPLUSRounded1c_700Bold,
} from '@expo-google-fonts/m-plus-rounded-1c';
import { OpenSans_400Regular, OpenSans_600SemiBold } from '@expo-google-fonts/open-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '../shared/api/queryClient';
import '../shared/i18n';
import { useTheme } from '../shared/theme';

// Intercepts OAuth deep link redirection (perseida:// or web callback) and dismisses web browser
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    MPLUSRounded1c_500Medium,
    MPLUSRounded1c_700Bold,
    OpenSans_400Regular,
    OpenSans_600SemiBold,
  });

  // If the fonts fail, carry on with the system ones rather than block the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={theme.name === 'dia' ? 'dark' : 'light'} />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
