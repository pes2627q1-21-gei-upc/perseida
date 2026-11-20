import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel, QuietButton, SkyBackground, StatusPanel } from '../../../shared/ui';
import { useTabBarInset } from '../../navigation/useTabBarInset';
import { useMySubscriptions, useRooms } from '../hooks/useChat';
import { buildRoomList } from '../roomList';
import { useAnnounceOnIos } from '../useAnnounceOnIos';
import { ActionSurface } from './ActionSurface';
import { ReloadFailedAlert } from './ReloadFailedAlert';
import { RoomListItem } from './RoomListItem';

// Layout only: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1 },
});
// Stryker restore all

/**
 * The chat tab (TG-469): the events the person is subscribed to, each with the last message of
 * its room, newest first. The subscriptions say what is listed and the rooms what was said
 * last. The page only orchestrates; tapping a row opens the room of its event.
 */
export function ChatRoomsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const subscriptions = useMySubscriptions();
  const rooms = useRooms();
  const [refreshing, setRefreshing] = useState(false);

  const entries =
    subscriptions.data && rooms.data ? buildRoomList(subscriptions.data, rooms.data) : undefined;
  const error = subscriptions.error ?? rooms.error;
  const fetching = subscriptions.isFetching || rooms.isFetching;
  // A reload that failed, with the list the person already had still on screen.
  const reloadError = entries && error && !fetching ? error : undefined;
  const emptyMessage = entries?.length === 0 ? t('chat.empty.message') : undefined;
  useAnnounceOnIos(emptyMessage);

  async function reload() {
    await Promise.all([subscriptions.refetch(), rooms.refetch()]);
  }

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  const statusTexts = {
    loadingLabel: t('chat.loading'),
    retry: t('chat.retry'),
    retryHint: t('chat.retryHint'),
  };
  // StatusPanel keeps its own margin of spacing.md: here only the side insets are added.
  const statusFrame = {
    paddingBottom: tabBarInset,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  let body;
  if (entries && entries.length > 0) {
    const now = new Date();
    body = (
      <FlatList
        testID="chat-rooms-list"
        accessibilityRole="list"
        accessibilityLabel={t('chat.list.label')}
        data={entries}
        keyExtractor={(entry) => entry.eventId}
        renderItem={({ item, index }) => (
          <RoomListItem
            entry={item}
            now={now}
            index={index}
            onPress={() => router.push(`/chat/${item.eventId}`)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.text.primary}
          />
        }
        contentContainerStyle={[
          styles.column,
          {
            maxWidth: readingMaxWidth,
            gap: spacing.md,
            paddingTop: spacing.md,
            paddingBottom: tabBarInset + spacing.md,
            paddingLeft: insets.left + spacing.md,
            paddingRight: insets.right + spacing.md,
          },
        ]}
      />
    );
  } else if (entries) {
    body = (
      <View
        testID="chat-rooms-empty"
        style={[
          styles.center,
          {
            paddingBottom: tabBarInset,
            paddingLeft: insets.left + spacing.md,
            paddingRight: insets.right + spacing.md,
          },
        ]}
      >
        <View style={[styles.column, { maxWidth: readingMaxWidth }]}>
          <GlassPanel>
            <View style={{ gap: spacing.md }}>
              <Text
                accessibilityLiveRegion="polite"
                style={[typography.body, { color: colors.text.primary }]}
              >
                {emptyMessage}
              </Text>
              <GelButton label={t('chat.empty.cta')} onPress={() => router.push('/events')} />
            </View>
          </GlassPanel>
        </View>
      </View>
    );
  } else if (error && !fetching) {
    body = (
      <View testID="chat-rooms-status" style={[styles.fill, statusFrame]}>
        <StatusPanel
          state="error"
          code={error.code}
          onRetry={error.retryable ? () => void reload() : undefined}
          texts={statusTexts}
        />
      </View>
    );
  } else {
    body = (
      <View testID="chat-rooms-status" style={[styles.fill, statusFrame]}>
        <StatusPanel state="loading" texts={statusTexts} />
      </View>
    );
  }

  return (
    <SkyBackground>
      <View style={[styles.fill, { paddingTop: insets.top + spacing.md }]}>
        <View
          style={[
            styles.column,
            {
              maxWidth: readingMaxWidth,
              paddingLeft: insets.left + spacing.md,
              paddingRight: insets.right + spacing.md,
            },
          ]}
        >
          <View style={[styles.titleRow, { gap: spacing.md }]}>
            <Text
              accessibilityRole="header"
              style={[typography.headline, styles.title, { color: colors.text.primary }]}
            >
              {t('chat.title')}
            </Text>
            {entries && (
              <ActionSurface>
                <QuietButton
                  label={t('chat.refresh')}
                  onPress={() => void reload()}
                  busy={fetching}
                />
              </ActionSurface>
            )}
          </View>
          {reloadError && (
            <View style={{ marginTop: spacing.md }}>
              <ReloadFailedAlert
                code={reloadError.code}
                onRetry={reloadError.retryable ? () => void reload() : undefined}
              />
            </View>
          )}
        </View>
        {body}
      </View>
    </SkyBackground>
  );
}
