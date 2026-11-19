import { Stack } from 'expo-router';

/**
 * The chat tab (TG-469): a Stack of its own, so the room of an event can open over the list
 * and keep the tab bar. The screens draw their own bar, so the Stack has no header.
 */
export default function ChatLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
