import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { type Theme, useTheme } from '../../../shared/theme';
import { formatUnreadCount, hasUnread } from '../unreadCount';

interface Props {
  /** How many messages are unread. 0 shows nothing. */
  count: number;
  /** Announce changes only when used as the inbox total on Android. */
  live?: boolean;
}

// Pop details: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const POP_FROM = 0.6;
// Stryker restore all

/**
 * The unread-messages pill (TG-65): gel in the brand colour with the number on it, «99+» from
 * 100. It is read as one element with the real count («137 missatges sense llegir»), never
 * «99+». It pops in softly (120 ms) unless the person asked for reduced motion.
 *
 * Contrast: the number is `gel.text` on `brandFill`: white on #5B5BF0 is 5.0:1 on dia, posta
 * and nit; #1A0508 on #FF6B5E is 7.0:1 on vermell. All above 4.5:1 (WCAG 2.2 AA).
 */
export function UnreadBadge({ count, live = false }: Props) {
  if (!hasUnread(count)) return null;
  return <Pill count={count} live={live} />;
}

function Pill({ count, live }: { count: number; live: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const styles = createStyles(theme);
  const reduceMotion = useReducedMotion();

  const shown = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    shown.value = withTiming(1, {
      duration: theme.duration.fast,
      easing: Easing.out(Easing.cubic),
    });
  }, [reduceMotion, shown, theme.duration.fast]);
  const pop = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: POP_FROM + (1 - POP_FROM) * shown.value }],
  }));

  return (
    <Animated.View style={pop}>
      <View
        testID="unread-badge"
        accessible
        accessibilityLabel={t('directChat.unread', { count })}
        accessibilityLiveRegion={live ? 'polite' : undefined}
        style={styles.pill}
      >
        <LinearGradient
          colors={colors.gel.highlight}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          pointerEvents="none"
          style={styles.highlight}
        />
        <Text style={styles.number}>{formatUnreadCount(count)}</Text>
      </View>
    </Animated.View>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose (convencions/testing.md, «Mutation testing»).
// Stryker disable all
function createStyles({ colors, spacing, radii, typography, touch }: Theme) {
  const size = touch.min / 2;
  return StyleSheet.create({
    pill: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      minWidth: size,
      height: size,
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      borderRadius: radii.pill,
      borderColor: colors.gel.rim,
      backgroundColor: colors.brandFill,
      boxShadow: `0 2px 8px ${colors.brandFill}66`,
    },
    // A thin line of light at the top edge, like the rows: it never lightens the number.
    highlight: { position: 'absolute', top: 0, left: spacing.sm, right: spacing.sm, height: 1 },
    number: { ...typography.caption, color: colors.gel.text, fontVariant: ['tabular-nums'] },
  });
}
// Stryker restore all
