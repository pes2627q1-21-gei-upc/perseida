import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppError, errorMessage } from '../../../shared/errors';
import { type Theme, useTheme } from '../../../shared/theme';
import { GlassPanel, QuietButton, SkyBackground, StatusPanel, TopBar } from '../../../shared/ui';
import { MessageComposer } from '../../chat/components/MessageComposer';
import { MessageList } from '../../chat/components/MessageList';
import { ActionSurface } from '../../chat/components/ActionSurface';
import { useAnnounceOnIos } from '../../../shared/a11y/useAnnounceOnIos';
import { useBlockUser, useUnblockUser } from '../hooks/useDirectChat';
import type { DirectMessage } from '../api/directChat';
import { useDirectConversation } from '../hooks/useDirectConversation';
import { useDirectTyping } from '../hooks/useDirectTyping';

interface Props {
  conversationId: string;
  otherUser: { id: string; displayName: string };
  blockedByMe: boolean;
  onBack: () => void;
}

function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setShown(true),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setShown(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/** Announce only a verified live event, never history or pagination. */
function useArrivalNotice(message: DirectMessage | undefined, name: string) {
  const { t } = useTranslation();
  const notice = useMemo(
    () =>
      message
        ? { key: message.id, text: t('chat.room.newMessage', { author: name, text: message.text }) }
        : undefined,
    [message, name, t],
  );
  useEffect(() => {
    if (notice && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(notice.text);
  }, [notice]);
  return notice;
}

export function DirectConversationScreen({
  conversationId,
  otherUser,
  blockedByMe,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const live = useDirectConversation(conversationId, otherUser.displayName);
  const typing = useDirectTyping(conversationId);
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const [blockError, setBlockError] = useState<AppError | null>(null);
  const [barBottom, setBarBottom] = useState(0);
  const keyboardShown = useKeyboardShown();
  const arrival = useArrivalNotice(live.lastIncoming, otherUser.displayName);
  const typingNotice = typing.isTyping
    ? t('directChat.room.typing', { name: otherUser.displayName })
    : undefined;
  useAnnounceOnIos(typingNotice);
  const statusTexts = {
    loadingLabel: t('directChat.room.loading'),
    retry: t('chat.retry'),
    retryHint: t('chat.room.retryHint'),
  };
  const disabledReasons = {
    connecting: t('chat.room.connection.connecting'),
    reconnecting: t('chat.room.connection.reconnecting'),
    closed: t('chat.room.connection.closed'),
  } as const;

  async function changeBlock() {
    setBlockError(null);
    try {
      await (blockedByMe ? unblock : block).mutateAsync(otherUser.id);
    } catch (error) {
      setBlockError(error as AppError);
    }
  }

  let content;
  if (live.error) {
    content = (
      <StatusPanel
        state="error"
        code={live.error.code}
        onRetry={live.error.retryable ? live.reload : undefined}
        texts={statusTexts}
      />
    );
  } else if (live.isLoading) {
    content = <StatusPanel state="loading" texts={statusTexts} />;
  } else if (!live.items.length) {
    content = (
      <View style={styles.center}>
        <GlassPanel>
          <Text style={styles.text}>{t('directChat.noMessages')}</Text>
        </GlassPanel>
      </View>
    );
  } else {
    content = (
      <MessageList
        items={live.items}
        hasMore={live.hasMore}
        isFetchingMore={live.isFetchingMore}
        onLoadOlder={live.loadOlder}
        onRetry={(id) => void live.retry(id)}
        onDiscard={live.discard}
      />
    );
  }

  return (
    <SkyBackground>
      <TopBar
        title={otherUser.displayName}
        testID="direct-chat-top-bar"
        onBack={onBack}
        onLayout={setBarBottom}
      />
      <View
        style={[
          styles.actions,
          {
            paddingTop: barBottom + theme.spacing.sm,
            paddingLeft: insets.left + theme.spacing.md,
            paddingRight: insets.right + theme.spacing.md,
          },
        ]}
      >
        <ActionSurface>
          <QuietButton
            label={t(blockedByMe ? 'directChat.room.unblock' : 'directChat.room.block')}
            onPress={() => void changeBlock()}
            busy={block.isPending || unblock.isPending}
          />
        </ActionSurface>
        {live.status === 'closed' && (
          <ActionSurface>
            <QuietButton label={t('chat.room.reconnect')} onPress={live.reconnect} />
          </ActionSurface>
        )}
        {blockError && (
          <GlassPanel>
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.text}>
              {errorMessage(t, blockError.code, blockError.retryable)}
            </Text>
          </GlassPanel>
        )}
      </View>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.fill}>{content}</View>
        {typing.isTyping && (
          <GlassPanel>
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {typingNotice}
            </Text>
          </GlassPanel>
        )}
        {!live.error && (
          <MessageComposer
            onSend={live.send}
            onTyping={typing.setTyping}
            busy={live.isLoading}
            disabledReason={live.status === 'open' ? undefined : disabledReasons[live.status]}
            bottomInset={keyboardShown ? 0 : insets.bottom}
          />
        )}
      </KeyboardAvoidingView>
      {arrival && Platform.OS !== 'ios' && (
        <Text key={arrival.key} accessibilityLiveRegion="polite" style={styles.offscreen}>
          {arrival.text}
        </Text>
      )}
    </SkyBackground>
  );
}

function createStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
    actions: { alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md },
    text: { ...typography.body, color: colors.text.primary },
    offscreen: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden' },
  });
}
