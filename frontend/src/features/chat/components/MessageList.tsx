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
import { dateTimeFormat } from '../dateFormat';
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
  /** Drops a refused message from the room. */
  onDiscard?: (clientMessageId: string) => void;
  listProps?: ListProps;
}

type Styles = ReturnType<typeof createStyles>;

/** The start of a day, as a heading with the long date in the language of the app. */
function DaySeparator({ date, styles }: { date: string; styles: Styles }) {
  const { i18n } = useTranslation();
  const day = dateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(date));

  return (
    <View style={styles.center}>
      <View style={styles.pill}>
        <Text accessibilityRole="header" style={styles.day}>
          {day}
        </Text>
      </View>
    </View>
  );
}

/** Drawn at the top of the inverted list while an older page loads. */
function LoadingOlder({ label, styles }: { label: string; styles: Styles }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <View style={styles.pill}>
        <ActivityIndicator accessibilityLabel={label} color={colors.text.primary} />
      </View>
    </View>
  );
}

/**
 * The messages of a room (TG-469), as an inverted list: the newest at the bottom, where the
 * composer is. Reaching the top asks for older messages, once at a time. Only what arrives while
 * the room is open floats in (arrivedKeys); the history and older pages appear at once, and so
 * does the first message of an empty room. Without items it draws nothing: the screen has its own
 * empty state. The order a screen reader follows in an inverted list is to be checked on a
 * device (VoiceOver and TalkBack).
 */
export function MessageList({
  items,
  hasMore,
  isFetchingMore,
  onLoadOlder,
  onRetry,
  onDiscard,
  listProps,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme, useReduceTransparency());
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
      <DaySeparator date={item.date} styles={styles} />
    ) : (
      <MessageBubble
        item={item}
        onRetry={onRetry}
        onDiscard={onDiscard}
        entering={arrived.has(item.key)}
      />
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
        isFetchingMore ? (
          <LoadingOlder label={t('chat.messages.loadingOlder')} styles={styles} />
        ) : undefined
      }
      contentContainerStyle={[styles.content, listProps?.contentContainerStyle]}
    />
  );
}

// Purely visual styles, all from theme tokens, and how early the older page is asked for. They
// are left out of mutation testing on purpose: a changed padding or colour is not behaviour a
// unit test should pin down (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const LOAD_OLDER_THRESHOLD = 0.5;

/** The column is capped at a readable width on wide screens; the pills are glass of a row. */
function createStyles({ colors, radii, spacing, typography }: Theme, reduceTransparency: boolean) {
  return StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: readingMaxWidth,
      alignSelf: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    center: { alignItems: 'center', paddingVertical: spacing.sm },
    pill: {
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      borderColor: colors.surface.glassBorder,
      backgroundColor: rowSurface(colors.surface, reduceTransparency),
    },
    day: { ...typography.caption, color: colors.text.primary },
  });
}
// Stryker restore all
