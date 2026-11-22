import { useLocalSearchParams } from 'expo-router';

import { ChatRoomScreen } from '../../../features/chat/components/ChatRoomScreen';

/** `/chat/<eventId>`: the chat room of an event, over the list of rooms (TG-469). */
export default function ChatRoomRoute() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <ChatRoomScreen eventId={eventId} />;
}
