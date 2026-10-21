import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '../../../shared/theme';

/** Share of the screen taken by the lake at the bottom; mirrors SkyBackground. */
const LAKE_SHARE = 0.24;
const STREAK_THICKNESS = 2;
const REFLECTION_OPACITY = 0.35;
/** The reflection is squashed: how much of the sky height it keeps inside the lake. */
const REFLECTION_SQUASH = 0.15;
/** A meteor crosses the sky in 1.1 s; the rest of the cycle is calm (6–12 s per cycle). */
const FLIGHT_MS = 1100;
/** Direction of the flight: down and to the left, at this angle below the horizontal. */
const ANGLE_DEG = 28;
const FADE_STOPS = [0, 0.15, 0.85, 1];
const FADE_VALUES = [0, 1, 1, 0];

interface MeteorSpec {
  /** Start position as a share of the width and of the sky height. */
  x: number;
  y: number;
  length: number;
  cycleMs: number;
  delayMs: number;
}

// Three meteors on different cycles: never more than a couple are visible at once.
const METEORS: MeteorSpec[] = [
  { x: 0.9, y: 0.06, length: 120, cycleMs: 7000, delayMs: 800 },
  { x: 0.62, y: 0.16, length: 90, cycleMs: 9000, delayMs: 3600 },
  { x: 1, y: 0.3, length: 140, cycleMs: 11500, delayMs: 6200 },
];

interface MeteorProps {
  spec: MeteorSpec;
  progress: SharedValue<number>;
  width: number;
  skyHeight: number;
}

/** One streak in the sky and its faint, squashed reflection in the lake. */
function Meteor({ spec, progress, width, skyHeight }: MeteorProps) {
  const { colors } = useTheme();
  const flight = FLIGHT_MS / spec.cycleMs;
  const radians = (ANGLE_DEG * Math.PI) / 180;
  const travel = width * 0.5;
  const startX = spec.x * width;
  const startY = spec.y * skyHeight;
  const dx = -travel * Math.cos(radians);
  const dy = travel * Math.sin(radians);

  // t goes 0 → 1 along the flight, then stays at 1 (hidden) until the cycle restarts.
  const sky = useAnimatedStyle(() => {
    const t = Math.min(progress.value / flight, 1);
    return {
      opacity: interpolate(t, FADE_STOPS, FADE_VALUES),
      transform: [{ translateX: dx * t }, { translateY: dy * t }, { rotate: `${ANGLE_DEG}deg` }],
    };
  });

  const lake = useAnimatedStyle(() => {
    const t = Math.min(progress.value / flight, 1);
    const y = startY + dy * t;
    return {
      opacity: interpolate(t, FADE_STOPS, FADE_VALUES) * REFLECTION_OPACITY,
      transform: [
        { translateX: dx * t },
        { translateY: skyHeight + (skyHeight - y) * REFLECTION_SQUASH - startY },
        { rotate: `${-ANGLE_DEG * REFLECTION_SQUASH * 2}deg` },
      ],
    };
  });

  const streak = (length: number) => ({
    position: 'absolute' as const,
    left: startX - length,
    top: startY,
    width: length,
    height: STREAK_THICKNESS,
  });
  const { head, tail: tailColor } = colors.meteor;
  // The tail fades in from fully transparent (8-digit hex: the colour plus alpha 00).
  const tail: [string, string, string] = [`${tailColor}00`, tailColor, head];

  return (
    <>
      <Animated.View style={[streak(spec.length), sky]}>
        <LinearGradient
          colors={tail}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[streak(spec.length * 0.4), lake]}>
        <LinearGradient
          colors={tail}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </>
  );
}

function useMeteorProgress(spec: MeteorSpec): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    // Reduce motion: freeze the streak halfway through its flight, a calm still frame.
    if (reduceMotion) {
      progress.value = (FLIGHT_MS / spec.cycleMs) * 0.5;
      return undefined;
    }
    const start = () => {
      progress.value = 0;
      progress.value = withDelay(
        spec.delayMs,
        withRepeat(withTiming(1, { duration: spec.cycleMs, easing: Easing.linear }), -1, false),
      );
    };
    start();
    // Nothing moves while the app is in the background.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else cancelAnimation(progress);
    });
    return () => {
      subscription.remove();
      cancelAnimation(progress);
    };
  }, [reduceMotion, progress, spec.cycleMs, spec.delayMs]);

  return progress;
}

function AnimatedMeteor({ spec, width, skyHeight }: Omit<MeteorProps, 'progress'>) {
  const progress = useMeteorProgress(spec);
  return <Meteor spec={spec} progress={progress} width={width} skyHeight={skyHeight} />;
}

/**
 * The memorable element of the sign-in screen: a few Perseids crossing the sky, with their
 * faint reflection in the lake. Decorative, so hidden from screen readers; it never takes touches.
 */
export function PerseidShower() {
  const { width, height } = useWindowDimensions();
  const skyHeight = height * (1 - LAKE_SHARE);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {METEORS.map((spec) => (
        <AnimatedMeteor key={spec.cycleMs} spec={spec} width={width} skyHeight={skyHeight} />
      ))}
    </View>
  );
}
