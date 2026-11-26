import { LinearGradient } from 'expo-linear-gradient';
import { Prohibit } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { type Theme, useTheme } from '../../../shared/theme';
import { useReduceTransparency } from '../../../shared/ui';
import { formatMessageTime } from '../../chat/formatChat';
import { rowCardStyle } from '../../chat/rowCardStyle';
import { conversationLabel, initialOf, previewText } from '../conversationRow';
import type { ConversationView } from '../types';
import { UnreadBadge } from './UnreadBadge';

interface Props {
  conversation: ConversationView;
  /** The moment the list is read: a message of today shows its time, any other its date. */
  now: Date;
  /** Opens the conversation. Without it the row is only read, not a button. */
  onPress?: () => void;
}

// Size of the avatar, as a multiple of the touch target (a purely visual measure).
// Stryker disable all
const AVATAR_SIZE = 44;
const HIGHLIGHT_INSET = 18;
// Stryker restore all

/**
 * One 1-to-1 conversation of the list (TG-65): avatar (or the initial of the name), name, the
 * last message cut to one line («Tu: …» if it is mine), when it was sent, the unread pill and a
 * «blocked» mark with an icon and text. Read as a single item. Glass without blur, like the
 * rows of the event rooms (a blur per row would be too heavy for a list).
 */
export function ConversationRow({ conversation, now, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const reduceTransparency = useReduceTransparency();
  const styles = createStyles(theme, reduceTransparency);

  const { id, otherUser, lastMessage, unreadCount, blockedByMe } = conversation;
  const preview = previewText(t, lastMessage);
  const time = lastMessage ? formatMessageTime(lastMessage.sentAt, now, i18n.language) : undefined;
  const label = conversationLabel(t, conversation, time);

  const content = (
    <>
      <LinearGradient
        colors={colors.gel.highlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
        style={styles.highlight}
      />
      <View testID="direct-conversation-avatar" style={styles.avatar}>
        {otherUser.avatarUrl ? (
          <Image
            testID="direct-conversation-avatar-image"
            source={{ uri: otherUser.avatarUrl }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.avatarImage}
          />
        ) : (
          <Text style={styles.initial}>{initialOf(otherUser.displayName)}</Text>
        )}
      </View>
      <View style={styles.text}>
        <View style={styles.head}>
          <Text style={styles.name}>{otherUser.displayName}</Text>
          {time !== undefined && <Text style={styles.time}>{time}</Text>}
        </View>
        <View style={styles.foot}>
          <Text numberOfLines={1} style={styles.preview}>
            {preview}
          </Text>
          <UnreadBadge count={unreadCount} />
        </View>
        {blockedByMe && (
          <View style={styles.blocked}>
            <Prohibit size={theme.iconSizes.sm} color={colors.text.secondary} weight="bold" />
            <Text style={styles.blockedText}>{t('directChat.blocked')}</Text>
          </View>
        )}
      </View>
    </>
  );

  return onPress ? (
    <Pressable
      testID={`direct-conversation-${id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      testID={`direct-conversation-${id}`}
      accessible
      accessibilityLabel={label}
      style={styles.row}
    >
      {content}
    </View>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose (convencions/testing.md, «Mutation testing»).
// Stryker disable all
function createStyles(
  { colors, spacing, radii, touch, typography }: Theme,
  reduceTransparency: boolean,
) {
  return StyleSheet.create({
    row: rowCardStyle({ colors, spacing, radii, touch }, reduceTransparency),
    rowPressed: { borderColor: colors.accentGlow },
    avatar: {
      alignItems: 'center',
      justifyContent: 'center',
      // A minimum that grows with the text scale (WCAG 1.4.4); only the picture is clipped.
      minWidth: AVATAR_SIZE,
      minHeight: AVATAR_SIZE,
      aspectRatio: 1,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.glassSolid,
    },
    avatarImage: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    initial: { ...typography.bodyStrong, color: colors.text.primary },
    text: { flex: 1, gap: spacing.xs },
    head: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    name: { ...typography.bodyStrong, flex: 1, color: colors.text.primary },
    time: { ...typography.caption, color: colors.text.secondary },
    foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    preview: { ...typography.body, flex: 1, color: colors.text.secondary },
    blocked: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    blockedText: { ...typography.caption, color: colors.text.secondary },
    highlight: {
      position: 'absolute',
      top: 0,
      height: 1,
      left: HIGHLIGHT_INSET,
      right: HIGHLIGHT_INSET,
    },
  });
}
// Stryker restore all
