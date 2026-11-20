import { LinearGradient } from 'expo-linear-gradient';
import { Warning, WarningCircle } from 'phosphor-react-native';
import { type ComponentRef, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { errorMessage } from '../../../shared/errors';
import { type Theme, useTheme } from '../../../shared/theme';
import { QuietButton, useReduceTransparency } from '../../../shared/ui';
import { type BubbleSurface, bubbleSurface } from '../bubbleSurface';
import type { MessageItem, PendingItem } from '../chatItems';
import { dateTimeFormat } from '../dateFormat';
import { rowSurface } from '../rowSurface';
import { useAnnounceOnIos } from '../useAnnounceOnIos';

interface Props {
  item: MessageItem | PendingItem;
  /** Sends a failed or uncertain message again, with the same `clientMessageId`. */
  onRetry?: (clientMessageId: string) => void;
  /** Drops a refused message from the room. */
  onDiscard?: (clientMessageId: string) => void;
  /** It arrived while the room is open: it floats in, unless the person asked for reduced motion. */
  entering?: boolean;
}

type Styles = ReturnType<typeof createStyles>;

/** Soft pulse of a message on its way; still with reduced motion. */
function SendingDot({ styles }: { styles: Styles }) {
  const { duration } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(
      // Stryker disable next-line ObjectLiteral,ArithmeticOperator: pace of the pulse, visual only.
      withTiming(PULSE_LOW, { duration: duration.slow * 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduceMotion, opacity, duration.slow]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID="chat-sending-dot"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.dot, pulse]}
    />
  );
}

/**
 * The material under the text: the gel body with its gloss pill (a message on its way is matte,
 * not yet set), or the 1 px highlight of the glass.
 */
function BubbleSkin({
  surface,
  sending,
  styles,
}: {
  surface: BubbleSurface;
  sending: boolean;
  styles: Styles;
}) {
  const { colors } = useTheme();
  if (!surface.gradient) {
    return (
      <LinearGradient
        colors={colors.gel.highlight}
        // Stryker disable next-line ObjectLiteral: direction of the highlight, visual only.
        start={{ x: 0, y: 0 }}
        // Stryker disable next-line ObjectLiteral: direction of the highlight, visual only.
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
        style={styles.line}
      />
    );
  }
  return (
    <>
      <LinearGradient colors={surface.gradient} style={StyleSheet.absoluteFill} />
      {!sending && (
        // The gloss stays in the top padding, above the text (tokens.md).
        <LinearGradient colors={colors.gel.highlight} pointerEvents="none" style={styles.gloss} />
      )}
    </>
  );
}

/**
 * Why a message did not go, on a glass note next to the bubble: an icon and the text in the
 * danger colour, measured legible on that glass over the whole scene (never on the bare sky).
 */
function ProblemNote({ failed, text, styles }: { failed: boolean; text: string; styles: Styles }) {
  const { colors, iconSizes } = useTheme();
  const Icon = failed ? WarningCircle : Warning;
  return (
    <View style={styles.note}>
      <View
        testID="chat-message-problem-icon"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Stryker disable next-line StringLiteral: icon weight, visual only. */}
        <Icon size={iconSizes.sm} color={colors.state.danger} weight="fill" />
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.noteText}>
        {text}
      </Text>
    </View>
  );
}

/** Float-up of a message that has just arrived; at once with reduced motion or for the history. */
function useFloatIn(entering: boolean) {
  const { duration } = useTheme();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(entering && !reduceMotion ? 0 : 1);
  useEffect(() => {
    if (shown.value === 1) return;
    // Stryker disable next-line ObjectLiteral: curve of the entrance, visual only.
    shown.value = withTiming(1, { duration: duration.base, easing: Easing.out(Easing.cubic) });
  }, [shown, duration.base]);
  return useAnimatedStyle(() => ({
    opacity: shown.value,
    // Stryker disable next-line ArithmeticOperator: distance of the float, visual only.
    transform: [{ translateY: (1 - shown.value) * ENTER_OFFSET }],
  }));
}

/**
 * One message of the room (TG-469), read as a single element: «author, time: text». Mine is
 * gel and the others' glass; a message on its way is busy and pulses, and one that did not go
 * says so in text, with an icon (never only colour), and offers to retry it next to the bubble.
 */
export function MessageBubble({ item, onRetry, onDiscard, entering = false }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const reduceTransparency = useReduceTransparency();
  const enter = useFloatIn(entering);
  const bubble = useRef<ComponentRef<typeof View>>(null);

  const mine = item.kind === 'pending' || item.mine;
  const surface = bubbleSurface(theme.colors, mine, reduceTransparency);
  const styles = createStyles(theme, surface, reduceTransparency);
  const you = t('chat.you');
  const sending = item.kind === 'pending' && item.status === 'sending';
  const failure = item.kind === 'pending' ? item.error : undefined;
  const failed = item.kind === 'pending' && item.status === 'failed';
  let problem = '';
  if (failed && failure) problem = errorMessage(t, failure.code, failure.retryable);
  else if (item.kind === 'pending' && !sending) problem = t(`chat.message.${item.status}`);
  // A refusal without its reason is taken as one that may go through later.
  const canRetry = !failed || (failure?.retryable ?? true);
  useAnnounceOnIos(problem || undefined);

  let label: string;
  let author: string | undefined;
  let time: string | undefined;
  if (item.kind === 'message') {
    const name = mine ? you : (item.message.author.name ?? t('chat.unknownAuthor'));
    time = dateTimeFormat(i18n.language, { timeStyle: 'short' }).format(
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

  return (
    <Animated.View style={[styles.column, mine ? styles.mine : styles.others, enter]}>
      <View
        ref={bubble}
        testID={`chat-message-${item.key}`}
        accessible
        accessibilityLabel={label}
        accessibilityState={{ busy: sending }}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOthers]}
      >
        <BubbleSkin surface={surface} sending={sending} styles={styles} />
        {author !== undefined && <Text style={styles.author}>{author}</Text>}
        <Text selectable style={styles.body}>
          {text}
        </Text>
        {time !== undefined && <Text style={styles.meta}>{time}</Text>}
        {sending && (
          <View style={styles.status}>
            <SendingDot styles={styles} />
            <Text style={styles.statusText}>{t('chat.message.sending')}</Text>
          </View>
        )}
      </View>
      {item.kind === 'pending' && problem !== '' && (
        <>
          <ProblemNote failed={failed} text={problem} styles={styles} />
          {onRetry && canRetry && (
            <QuietButton
              label={t('chat.message.retry')}
              onPress={() => {
                onRetry(item.clientMessageId);
                // The button goes away with the retry: the focus goes to the bubble, not nowhere.
                if (bubble.current)
                  AccessibilityInfo.sendAccessibilityEvent(bubble.current, 'focus');
              }}
            />
          )}
          {onDiscard && failed && (
            <QuietButton
              label={t('chat.message.discard')}
              onPress={() => onDiscard(item.clientMessageId)}
            />
          )}
        </>
      )}
    </Animated.View>
  );
}

// Purely visual styles and motion values, all from theme tokens. They are left out of mutation
// testing on purpose: a changed padding, colour or distance is not behaviour a unit test should
// pin down (convencions/testing.md, «Mutation testing»). Behaviour stays in the JSX above.
// Stryker disable all
const ENTER_OFFSET = 8;
const PULSE_LOW = 0.35;
const HIGHLIGHT_INSET = 18;
/** The gloss of my bubbles fits in the top padding (spacing.sm), above the text. */
const GLOSS_HEIGHT = 6;

/**
 * A drop of gel for mine and glass for the others'. The corner on the side of the author is
 * smaller, like the tail of a speech bubble. Max 80 % of the column, which is capped on wide
 * screens by the list.
 */
function createStyles(
  { colors, radii, spacing, typography }: Theme,
  surface: BubbleSurface,
  reduceTransparency: boolean,
) {
  const meta = { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end' } as const;
  return StyleSheet.create({
    column: { width: '100%', gap: spacing.xs },
    mine: { alignItems: 'flex-end' },
    others: { alignItems: 'flex-start' },
    bubble: {
      maxWidth: '80%',
      overflow: 'hidden',
      borderWidth: 1,
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      borderColor: surface.border,
      backgroundColor: surface.background,
    },
    bubbleMine: {
      borderBottomRightRadius: radii.sm,
      boxShadow: `0 6px 16px ${colors.gel.rim}59`,
    },
    bubbleOthers: {
      borderBottomLeftRadius: radii.sm,
      boxShadow: `0 6px 16px ${colors.accentGlow}33`,
    },
    gloss: {
      position: 'absolute',
      top: 1,
      left: radii.md,
      right: radii.md,
      height: GLOSS_HEIGHT,
      borderRadius: radii.pill,
    },
    line: {
      position: 'absolute',
      top: 0,
      height: 1,
      left: HIGHLIGHT_INSET,
      right: HIGHLIGHT_INSET,
    },
    author: { ...typography.caption, color: surface.secondaryText },
    body: { ...typography.body, color: surface.text },
    meta: { ...typography.caption, ...meta, color: surface.secondaryText },
    status: { ...meta, gap: spacing.xs },
    statusText: { ...typography.caption, color: surface.secondaryText },
    dot: {
      width: spacing.sm,
      height: spacing.sm,
      borderRadius: spacing.xs,
      backgroundColor: surface.secondaryText,
    },
    note: {
      maxWidth: '80%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderWidth: 1,
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderColor: colors.surface.glassBorder,
      backgroundColor: rowSurface(colors.surface, reduceTransparency),
    },
    noteText: { ...typography.body, flexShrink: 1, color: colors.state.danger },
  });
}
// Stryker restore all
