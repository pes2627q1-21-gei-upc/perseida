import { Stack } from 'expo-router';

/**
 * The chat tab (TG-469): a Stack of its own, so the room of an event opens over the list and
 * going back returns to it. The room hides the tab bar ((app)/_layout); the screens draw their
 * own bar, so the Stack has no header.
 */
export default function ChatLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
