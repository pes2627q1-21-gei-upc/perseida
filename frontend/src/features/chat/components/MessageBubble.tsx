import { LinearGradient } from 'expo-linear-gradient';
import { Warning, WarningCircle } from 'phosphor-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { type Theme, useTheme } from '../../../shared/theme';
import { QuietButton, useReduceTransparency } from '../../../shared/ui';
import { type BubbleSurface, bubbleSurface } from '../bubbleSurface';
import type { MessageItem, PendingItem } from '../chatItems';
import { rowSurface } from '../rowSurface';
import { useAnnounceOnIos } from '../useAnnounceOnIos';

interface Props {
  item: MessageItem | PendingItem;
  /** Sends a failed or uncertain message again, with the same `clientMessageId`. */
  onRetry?: (clientMessageId: string) => void;
  /** It arrived while the room is open: it floats in, unless the person asked for reduced motion. */
  entering?: boolean;
}

// Shape, gloss and motion of the bubble: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const ENTER_OFFSET = 8;
const PULSE_LOW = 0.35;
const HIGHLIGHT_INSET = 18;
/** The gloss of my bubbles fits in the top padding (spacing.sm), above the text. */
const GLOSS_HEIGHT = 6;
const styles = StyleSheet.create({
  column: { width: '100%' },
  mine: { alignItems: 'flex-end' },
  others: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', overflow: 'hidden', borderWidth: 1 },
  gloss: { position: 'absolute', top: 1 },
  line: { position: 'absolute', top: 0, height: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end' },
  note: { maxWidth: '80%', flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1 },
  noteText: { flexShrink: 1 },
});

/**
 * A drop of gel for mine, with its gloss above the text, and glass with a 1 px highlight for the
 * others'. The corner on the side of the author is smaller, like the tail of a speech bubble.
 */
function bubbleStyle({ colors, radii, spacing }: Theme, surface: BubbleSurface, mine: boolean) {
  return {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    ...(mine ? { borderBottomRightRadius: radii.sm } : { borderBottomLeftRadius: radii.sm }),
    borderColor: surface.border,
    backgroundColor: surface.background,
    boxShadow: `0 6px 16px ${mine ? `${colors.gel.rim}59` : `${colors.accentGlow}33`}`,
  };
}

/** Soft pulse of a message on its way; still with reduced motion. */
function SendingDot({ color }: { color: string }) {
  const { duration, spacing } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(
      withTiming(PULSE_LOW, { duration: duration.slow * 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduceMotion, opacity, duration.slow]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        pulse,
        { width: spacing.sm, height: spacing.sm, borderRadius: spacing.xs, backgroundColor: color },
      ]}
    />
  );
}
// Stryker restore all

/**
 * One message of the room (TG-469), read as a single element: «author, time: text». Mine is
 * gel and the others' glass; a message on its way is busy and pulses, and one that did not go
 * says so in text, with an icon (never only colour), and offers to retry it next to the bubble.
 */
export function MessageBubble({ item, onRetry, entering = false }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, typography, radii, iconSizes } = theme;
  const reduceTransparency = useReduceTransparency();
  const reduceMotion = useReducedMotion();

  const mine = item.kind === 'pending' || item.mine;
  const surface = bubbleSurface(colors, mine, reduceTransparency);
  const you = t('chat.you');
  const sending = item.kind === 'pending' && item.status === 'sending';
  const problem =
    item.kind === 'pending' && item.status !== 'sending' ? t(`chat.message.${item.status}`) : '';
  useAnnounceOnIos(problem || undefined);

  let label: string;
  let author: string | undefined;
  let time: string | undefined;
  if (item.kind === 'message') {
    const name = mine ? you : (item.message.author.name ?? t('chat.unknownAuthor'));
    time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(
      new Date(item.message.sent_at),
    );
    label = t('chat.message.label', { author: name, time, text: item.message.text });
    author = item.showAuthor && !mine ? name : undefined;
  } else {
    label = t(sending ? 'chat.message.sendingLabel' : 'chat.message.pendingLabel', {
      author: you,
      text: item.text,
    });
  }
  const text = item.kind === 'message' ? item.message.text : item.text;

  // Stryker disable all: entrance motion, visual only.
  const shown = useSharedValue(entering && !reduceMotion ? 0 : 1);
  useEffect(() => {
    if (shown.value === 1) return;
    shown.value = withTiming(1, {
      duration: theme.duration.base,
      easing: Easing.out(Easing.cubic),
    });
  }, [shown, theme.duration.base]);
  const enter = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * ENTER_OFFSET }],
  }));
  // Stryker restore all

  return (
    <Animated.View
      style={[styles.column, mine ? styles.mine : styles.others, { gap: spacing.xs }, enter]}
    >
      <View
        testID={`chat-message-${item.key}`}
        accessible
        accessibilityLabel={label}
        accessibilityState={{ busy: sending }}
        style={[styles.bubble, bubbleStyle(theme, surface, mine)]}
      >
        {surface.gradient && (
          <LinearGradient colors={surface.gradient} style={StyleSheet.absoluteFill} />
        )}
        {surface.gradient && !sending && (
          // The gloss stays in the top padding, above the text (tokens.md).
          <LinearGradient
            colors={colors.gel.highlight}
            pointerEvents="none"
            style={[
              styles.gloss,
              {
                left: radii.md,
                right: radii.md,
                height: GLOSS_HEIGHT,
                borderRadius: radii.pill,
              },
            ]}
          />
        )}
        {!surface.gradient && (
          <LinearGradient
            colors={colors.gel.highlight}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={[styles.line, { left: HIGHLIGHT_INSET, right: HIGHLIGHT_INSET }]}
          />
        )}
        {author !== undefined && (
          <Text style={[typography.caption, { color: surface.secondaryText }]}>{author}</Text>
        )}
        <Text selectable style={[typography.body, { color: surface.text }]}>
          {text}
        </Text>
        {time !== undefined && (
          <Text style={[typography.caption, styles.meta, { color: surface.secondaryText }]}>
            {time}
          </Text>
        )}
        {sending && (
          <View style={[styles.meta, { gap: spacing.xs }]}>
            <SendingDot color={surface.secondaryText} />
            <Text style={[typography.caption, { color: surface.secondaryText }]}>
              {t('chat.message.sending')}
            </Text>
          </View>
        )}
      </View>
      {item.kind === 'pending' && problem !== '' && (
        <>
          <View
            style={[
              styles.note,
              {
                gap: spacing.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.md,
                borderColor: colors.surface.glassBorder,
                backgroundColor: rowSurface(colors.surface, reduceTransparency),
              },
            ]}
          >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {item.status === 'failed' ? (
                <WarningCircle size={iconSizes.sm} color={colors.state.danger} weight="fill" />
              ) : (
                <Warning size={iconSizes.sm} color={colors.state.danger} weight="fill" />
              )}
            </View>
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.body, styles.noteText, { color: colors.state.danger }]}
            >
              {problem}
            </Text>
          </View>
          {onRetry && (
            <QuietButton
              label={t('chat.message.retry')}
              onPress={() => onRetry(item.clientMessageId)}
            />
          )}
        </>
      )}
    </Animated.View>
  );
}
