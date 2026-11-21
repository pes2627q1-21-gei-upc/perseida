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
import { rowSurface } from '../rowSurface';

interface Props {
  entry: RoomListEntry;
  /** The moment the list is read: a message of today shows its time, any other its date. */
  now: Date;
  /** Opens the room. Without it the row is only read, not a button. */
  onPress?: () => void;
}

// Entrance and glass details: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const ENTER_OFFSET = 12;
const HIGHLIGHT_INSET = 18;
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1 },
  text: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { flex: 1 },
  highlight: { position: 'absolute', top: 0, height: 1 },
});

/** The card of the row: glass without blur, with a soft glow; a pressed row gets the glow rim. */
function rowStyle(
  { colors, spacing, radii, touch }: Theme,
  reduceTransparency: boolean,
  pressed: boolean,
) {
  return {
    minHeight: touch.min,
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderColor: pressed ? colors.accentGlow : colors.surface.glassBorder,
    backgroundColor: rowSurface(colors.surface, reduceTransparency),
    boxShadow: `0 8px 24px ${colors.accentGlow}33`,
  };
}
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
  const { colors, spacing, typography } = theme;
  const reduceTransparency = useReduceTransparency();
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
        style={[styles.highlight, { left: HIGHLIGHT_INSET, right: HIGHLIGHT_INSET }]}
      />
      <EventOrb category={entry.category} active={false} />
      <View style={[styles.text, { gap: spacing.xs }]}>
        <View style={[styles.head, { gap: spacing.sm }]}>
          <Text style={[typography.bodyStrong, styles.title, { color: colors.text.primary }]}>
            {entry.title}
          </Text>
          {time !== undefined && (
            <Text style={[typography.caption, { color: colors.text.secondary }]}>{time}</Text>
          )}
        </View>
        <Text numberOfLines={2} style={[typography.body, { color: colors.text.secondary }]}>
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
          style={({ pressed }) => [styles.row, rowStyle(theme, reduceTransparency, pressed)]}
        >
          {content}
        </Pressable>
      ) : (
        <View
          testID={`chat-room-${entry.eventId}`}
          accessible
          accessibilityLabel={label}
          style={[styles.row, rowStyle(theme, reduceTransparency, false)]}
        >
          {content}
        </View>
      )}
    </Animated.View>
  );
}
