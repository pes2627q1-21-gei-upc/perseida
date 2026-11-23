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
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/chat/direct');
  }
  if (conversations.isPending || conversations.error || !conversation)
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
              code={conversations.error?.code ?? 'CONVERSATION_NOT_FOUND'}
              onRetry={
                conversations.error?.retryable ? () => void conversations.refetch() : undefined
              }
              texts={texts}
            />
          )}
        </View>
      </SkyBackground>
    );
  return (
    <DirectConversationScreen
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
