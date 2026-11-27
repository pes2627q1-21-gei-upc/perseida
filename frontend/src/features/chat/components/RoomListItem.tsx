import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { type Theme, useTheme } from '../../../shared/theme';
import { useReduceTransparency } from '../../../shared/ui';
import { EventOrb } from '../../events/components/EventOrb';
import { formatMessageTime } from '../formatChat';
import type { RoomListEntry } from '../roomList';
import { rowCardStyle } from '../rowCardStyle';

interface Props {
  entry: RoomListEntry;
  /** The moment the list is read: a message of today shows its time, any other its date. */
  now: Date;
  /** Opens the room. Without it the row is only read, not a button. */
  onPress?: () => void;
}

// Entrance details: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const ENTER_OFFSET = 12;
const HIGHLIGHT_INSET = 18;
// Stryker restore all

/**
 * One chat room of the list (TG-469): the orb of the category of the event, its title, the
 * last message as «author: text» and when it was sent. Read as a single item. It is glass
 * without blur (a blur per row would be too heavy for a list), and it enters with a short
 * quick float (120 ms, all rows at once) unless the person asked for reduced motion.
 */
export function RoomListItem({ entry, now, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const reduceTransparency = useReduceTransparency();
  const styles = createStyles(theme, reduceTransparency);
  const reduceMotion = useReducedMotion();

  const shown = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    // Under 150 ms and with no stagger: a list is read often (so-i-moviment.md, «Porta per a moviment nou»).
    shown.value = withTiming(1, {
      duration: theme.duration.fast,
      easing: Easing.out(Easing.cubic),
    });
  }, [reduceMotion, shown, theme.duration.fast]);
  const enter = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * ENTER_OFFSET }],
  }));

  const { lastMessage } = entry;
  const preview = lastMessage
    ? `${lastMessage.authorName ?? t('chat.unknownAuthor')}: ${lastMessage.text}`
    : t('chat.noMessages');
  const time = lastMessage ? formatMessageTime(lastMessage.sentAt, now, i18n.language) : undefined;
  const label = [entry.title, preview, time].filter(Boolean).join(', ');

  const content = (
    <>
      <LinearGradient
        colors={colors.gel.highlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
        style={styles.highlight}
      />
      <EventOrb category={entry.category} active={false} />
      <View style={styles.text}>
        <View style={styles.head}>
          <Text style={styles.title}>{entry.title}</Text>
          {time !== undefined && <Text style={styles.time}>{time}</Text>}
        </View>
        <Text numberOfLines={2} style={styles.preview}>
          {preview}
        </Text>
      </View>
    </>
  );

  return (
    <Animated.View style={enter}>
      {onPress ? (
        <Pressable
          testID={`chat-room-${entry.eventId}`}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          {content}
        </Pressable>
      ) : (
        <View
          testID={`chat-room-${entry.eventId}`}
          accessible
          accessibilityLabel={label}
          style={styles.row}
        >
          {content}
        </View>
      )}
    </Animated.View>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose (convencions/testing.md, «Mutation testing»).
// Stryker disable all
/** The card of the row: glass without blur, with a soft glow; a pressed row gets the glow rim. */
function createStyles(
  { colors, spacing, radii, touch, typography }: Theme,
  reduceTransparency: boolean,
) {
  return StyleSheet.create({
    row: rowCardStyle({ colors, spacing, radii, touch }, reduceTransparency),
    rowPressed: { borderColor: colors.accentGlow },
    text: { flex: 1, gap: spacing.xs },
    head: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    title: { ...typography.bodyStrong, flex: 1, color: colors.text.primary },
    time: { ...typography.caption, color: colors.text.secondary },
    preview: { ...typography.body, color: colors.text.secondary },
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
