import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  type FlatListProps,
  type ListRenderItem,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { readingMaxWidth, type Theme, useTheme } from '../../../shared/theme';
import { useReduceTransparency } from '../../../shared/ui';
import { arrivedKeys, type ChatListItem } from '../chatItems';
import { rowSurface } from '../rowSurface';
import { MessageBubble } from './MessageBubble';

/** What the screen may add to the list: keyboard behaviour, scroll handlers, insets. */
type ListProps = Omit<
  FlatListProps<ChatListItem>,
  'data' | 'renderItem' | 'keyExtractor' | 'inverted' | 'onEndReached'
>;

interface Props {
  /** From buildChatItems: newest first, the list is inverted. */
  items: ChatListItem[];
  /** There are older pages to ask for. */
  hasMore: boolean;
  /** An older page is on its way: it is not asked for again. */
  isFetchingMore: boolean;
  onLoadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  listProps?: ListProps;
}

// Layout and glass of the list: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const LOAD_OLDER_THRESHOLD = 0.5;
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: readingMaxWidth, alignSelf: 'center' },
  center: { alignItems: 'center' },
  pill: { borderWidth: 1 },
});

/** Room around the bubbles; the column is capped at a readable width on wide screens. */
function contentStyle({ spacing }: Theme) {
  return [styles.content, { gap: spacing.sm, padding: spacing.md }];
}

/** A small glass pill, centred: legible over any part of the scene (rowSurface). */
function pillStyle({ colors, radii, spacing }: Theme, reduceTransparency: boolean) {
  return {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderColor: colors.surface.glassBorder,
    backgroundColor: rowSurface(colors.surface, reduceTransparency),
  };
}

/** The start of a day, as a heading with the long date in the language of the app. */
function DaySeparator({ date }: { date: string }) {
  const { i18n } = useTranslation();
  const theme = useTheme();
  const reduceTransparency = useReduceTransparency();
  const day = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(date));

  return (
    <View style={[styles.center, { paddingVertical: theme.spacing.sm }]}>
      <View style={[styles.pill, pillStyle(theme, reduceTransparency)]}>
        <Text
          accessibilityRole="header"
          style={[theme.typography.caption, { color: theme.colors.text.primary }]}
        >
          {day}
        </Text>
      </View>
    </View>
  );
}

/** Drawn at the top of the inverted list while an older page loads. */
function LoadingOlder({ label }: { label: string }) {
  const theme = useTheme();
  const reduceTransparency = useReduceTransparency();

  return (
    <View style={[styles.center, { paddingVertical: theme.spacing.sm }]}>
      <View style={[styles.pill, pillStyle(theme, reduceTransparency)]}>
        <ActivityIndicator accessibilityLabel={label} color={theme.colors.text.primary} />
      </View>
    </View>
  );
}
// Stryker restore all

/**
 * The messages of a room (TG-469), as an inverted list: the newest at the bottom, where the
 * composer is. Reaching the top asks for older messages, once at a time. Only what arrives while
 * the room is open floats in (arrivedKeys); the history and older pages appear at once. Without
 * items it draws nothing: the screen has its own empty state.
 */
export function MessageList({
  items,
  hasMore,
  isFetchingMore,
  onLoadOlder,
  onRetry,
  listProps,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  // The items of the previous render, to tell what has just arrived (React: «storing information
  // from previous renders»).
  const [previous, setPrevious] = useState(items);
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());
  if (items !== previous) {
    setPrevious(items);
    setArrived(arrivedKeys(items, previous));
  }

  if (items.length === 0) return null;

  const renderItem: ListRenderItem<ChatListItem> = ({ item }) =>
    item.kind === 'day' ? (
      <DaySeparator date={item.date} />
    ) : (
      <MessageBubble item={item} onRetry={onRetry} entering={arrived.has(item.key)} />
    );

  return (
    <FlatList
      {...listProps}
      testID="chat-messages-list"
      accessibilityRole="list"
      accessibilityLabel={t('chat.messages.label')}
      inverted
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      extraData={arrived}
      onEndReached={() => {
        if (hasMore && !isFetchingMore) onLoadOlder();
      }}
      onEndReachedThreshold={LOAD_OLDER_THRESHOLD}
      ListFooterComponent={
        isFetchingMore ? <LoadingOlder label={t('chat.messages.loadingOlder')} /> : undefined
      }
      contentContainerStyle={[contentStyle(theme), listProps?.contentContainerStyle]}
    />
  );
}
