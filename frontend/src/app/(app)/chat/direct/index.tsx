import { useRouter } from 'expo-router';

import { ConversationsScreen } from '../../../../features/direct-chat/components/ConversationsScreen';

/** `/chat/direct`: direct conversations, alongside the existing event-chat list. */
export default function DirectListRoute() {
  const router = useRouter();
  return (
    <ConversationsScreen
      onOpen={(id) =>
        router.push({ pathname: '/chat/direct/[conversationId]', params: { conversationId: id } })
      }
    />
  );
}
