import { Stack } from 'expo-router';

/** Mobile app group (ADR-0020). Tabs will be added when there are more screens. */
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
