import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { DirectConversationScreen } from '../../../../features/direct-chat/components/DirectConversationScreen';
import { useConversations } from '../../../../features/direct-chat/hooks/useDirectChat';
import { SkyBackground, StatusPanel, TopBar } from '../../../../shared/ui';

/** Resolve the other participant from server data, including on a deep link or app restart. */
export default function DirectConversationRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const conversations = useConversations();
  const [barBottom, setBarBottom] = useState(0);
  const texts = {
    loadingLabel: t('directChat.room.loading'),
    retry: t('chat.retry'),
    retryHint: t('chat.retryHint'),
  };
  const conversation = conversations.data?.find((row) => row.conversation_id === conversationId);
  const failure = conversations.data ? null : conversations.error;
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/chat/direct');
  }
  // A refresh of the list that fails keeps what it already has: the open chat stays (every
  // message and every mark as read refreshes the list). The error is for when there is no data.
  if (conversations.isPending || failure || !conversation)
    return (
      <SkyBackground>
        <TopBar
          title={t('directChat.list.title')}
          testID="direct-chat-route-top-bar"
          onBack={goBack}
          onLayout={setBarBottom}
        />
        <View style={{ flex: 1, paddingTop: barBottom }}>
          {conversations.isPending ? (
            <StatusPanel state="loading" texts={texts} />
          ) : (
            <StatusPanel
              state="error"
              code={failure?.code ?? 'CONVERSATION_NOT_FOUND'}
              onRetry={failure?.retryable ? () => void conversations.refetch() : undefined}
              texts={texts}
            />
          )}
        </View>
      </SkyBackground>
    );
  return (
    <DirectConversationScreen
      key={conversation.conversation_id}
      conversationId={conversation.conversation_id}
      otherUser={{
        id: conversation.other_user_id,
        displayName: conversation.other_display_name || t('directChat.list.unknownUser'),
      }}
      blockedByMe={conversation.blocked_by_me}
      onBack={goBack}
    />
  );
}
