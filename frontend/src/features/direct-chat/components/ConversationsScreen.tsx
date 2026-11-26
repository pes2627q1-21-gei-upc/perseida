import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppError, errorMessage } from '../../../shared/errors';
import { safeHttpsUrl } from '../../../shared/security/safeUrl';
import { readingMaxWidth, type Theme, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel, SkyBackground, StatusPanel } from '../../../shared/ui';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { useTabBarInset } from '../../navigation/useTabBarInset';
import { useConversations, useOpenConversation } from '../hooks/useDirectChat';
import { ConversationRow } from './ConversationRow';
import { UnreadBadge } from './UnreadBadge';

/** The route decides where a selected conversation opens. */
export function ConversationsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarInset();
  const conversations = useConversations();
  const currentUser = useCurrentUser();
  const open = useOpenConversation();
  const [userId, setUserId] = useState('');
  const [openError, setOpenError] = useState<AppError | null>(null);
  const statusTexts = {
    loadingLabel: t('directChat.list.loading'),
    retry: t('chat.retry'),
    retryHint: t('chat.retryHint'),
  };

  async function start() {
    const id = userId.trim();
    if (!id) return;
    setOpenError(null);
    try {
      const result = await open.mutateAsync(id);
      onOpen(result.id);
    } catch (error) {
      setOpenError(error as AppError);
    }
  }

  const rows = conversations.data;
  const error = conversations.error ?? currentUser.error;
  const total = rows?.reduce((sum, row) => sum + row.unread_count, 0) ?? 0;
  // The first loaded total is a baseline; announce subsequent changes only.
  const ready = rows !== undefined && currentUser.data !== undefined;
  const [unreadState, setUnreadState] = useState<{ previous?: number; notice?: number }>({});
  if (ready && unreadState.previous !== total) {
    setUnreadState({
      previous: total,
      notice: unreadState.previous === undefined ? undefined : total,
    });
  }
  useEffect(() => {
    if (Platform.OS === 'ios' && unreadState.notice !== undefined) {
      AccessibilityInfo.announceForAccessibility(
        t('directChat.unread', { count: unreadState.notice }),
      );
    }
  }, [t, unreadState.notice]);
  const now = new Date();
  let content;
  if (error && (!rows || !currentUser.data)) {
    content = (
      <StatusPanel
        state="error"
        code={error.code}
        onRetry={
          error.retryable
            ? () => {
                if (conversations.error) void conversations.refetch();
                if (currentUser.error) void currentUser.refetch();
              }
            : undefined
        }
        texts={statusTexts}
      />
    );
  } else if (!rows || currentUser.isPending) {
    content = <StatusPanel state="loading" texts={statusTexts} />;
  } else {
    content = (
      <ScrollView
        contentContainerStyle={[
          styles.column,
          {
            paddingBottom: tabInset + theme.spacing.md,
            paddingLeft: insets.left + theme.spacing.md,
            paddingRight: insets.right + theme.spacing.md,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {t('directChat.list.title')}
          </Text>
          <UnreadBadge
            count={total}
            live={Platform.OS === 'android' && unreadState.notice !== undefined}
          />
          {Platform.OS === 'android' && unreadState.notice === 0 && total === 0 && (
            <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
              {t('directChat.unread', { count: 0 })}
            </Text>
          )}
        </View>
        <GlassPanel>
          <View style={styles.form}>
            <Text style={styles.text}>{t('directChat.list.userId')}</Text>
            <TextInput
              accessibilityLabel={t('directChat.list.userId')}
              value={userId}
              onChangeText={setUserId}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {openError && (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.text}>
                {errorMessage(t, openError.code, openError.retryable)}
              </Text>
            )}
            <GelButton
              label={t('directChat.list.open')}
              onPress={() => void start()}
              disabled={!userId.trim()}
              busy={open.isPending}
            />
          </View>
        </GlassPanel>
        {rows.length === 0 ? (
          <GlassPanel>
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {t('directChat.list.empty')}
            </Text>
          </GlassPanel>
        ) : (
          rows.map((row) => {
            const avatarUrl = row.other_avatar_url ? safeHttpsUrl(row.other_avatar_url) : undefined;
            const lastMessage =
              row.last_message_preview !== null && row.last_message_at !== null
                ? {
                    preview: row.last_message_preview,
                    sentAt: row.last_message_at,
                    fromMe: row.last_message_sender_id === currentUser.data?.id,
                  }
                : undefined;
            return (
              <ConversationRow
                key={row.conversation_id}
                now={now}
                onPress={() => onOpen(row.conversation_id)}
                conversation={{
                  id: row.conversation_id,
                  otherUser: {
                    id: row.other_user_id,
                    displayName: row.other_display_name || t('directChat.list.unknownUser'),
                    ...(avatarUrl ? { avatarUrl } : {}),
                  },
                  ...(lastMessage ? { lastMessage } : {}),
                  unreadCount: row.unread_count,
                  blockedByMe: row.blocked_by_me,
                }}
              />
            );
          })
        )}
      </ScrollView>
    );
  }
  return (
    <SkyBackground>
      <View style={[styles.fill, { paddingTop: insets.top + theme.spacing.md }]}>{content}</View>
    </SkyBackground>
  );
}

function createStyles({ colors, spacing, radii, touch, typography }: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    srOnly: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden' },
    column: { width: '100%', maxWidth: readingMaxWidth, alignSelf: 'center', gap: spacing.md },
    heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { ...typography.headline, flex: 1, color: colors.text.primary },
    text: { ...typography.body, color: colors.text.primary },
    form: { gap: spacing.sm },
    input: {
      ...typography.body,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.onGlass,
      borderRadius: radii.md,
      minHeight: touch.min,
      paddingHorizontal: spacing.md,
    },
  });
}
