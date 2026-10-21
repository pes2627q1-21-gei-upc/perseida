import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
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
/** The lake squashes the reflection: it keeps this share of the sky's height and slope. */
const REFLECTION_SQUASH = 0.15;
/** Length of the reflection relative to the streak. */
const REFLECTION_LENGTH = 0.5;
/** A meteor crosses the sky in 1.4 s; the rest of the cycle is calm (7–11.5 s per cycle). */
const FLIGHT_MS = 1400;
/** Perseids radiate from the north-east: they fall to the lower left at this angle below the horizontal. */
const ANGLE_DEG = 28;
/** Travel of the head, as a share of the screen width. */
const TRAVEL_SHARE = 0.55;
/** Where the frozen frame stops for reduced motion: halfway, streak fully drawn. */
const FROZEN_FLIGHT = 0.45;

const RADIANS = (ANGLE_DEG * Math.PI) / 180;
const TRAVEL_X = -Math.cos(RADIANS);
const TRAVEL_Y = Math.sin(RADIANS);
/** Unit vector of the head's motion on screen (y grows downwards): left and down. */
export const TRAVEL_DIRECTION = { x: TRAVEL_X, y: TRAVEL_Y };
/** Rotation of the bar (degrees, clockwise on screen): negative lifts its right end, the tail. */
export const STREAK_ROTATION_DEG = -ANGLE_DEG;
// Slope of the mirrored motion: same horizontal speed, vertical speed squashed and reversed.
const REFLECTION_ANGLE_DEG = (Math.atan(Math.tan(RADIANS) * REFLECTION_SQUASH) * 180) / Math.PI;
const FADE_STOPS = [0, 0.15, 0.6, 1];
const FADE_VALUES = [0, 1, 0.7, 0];
const STRETCH_STOPS = [0, 0.3, 1];
const STRETCH_VALUES = [0.15, 1, 0.35];

/** Where a meteor is at ``t`` (0 → 1 along its flight): offset of the head, opacity, tail stretch. */
export function flightPose(t: number, travel: number) {
  'worklet';
  const eased = 1 - (1 - t) * (1 - t);
  return {
    dx: TRAVEL_X * travel * eased,
    dy: TRAVEL_Y * travel * eased,
    opacity: interpolate(t, FADE_STOPS, FADE_VALUES, Extrapolation.CLAMP),
    stretch: interpolate(t, STRETCH_STOPS, STRETCH_VALUES, Extrapolation.CLAMP),
  };
}

interface MeteorSpec {
  /** Start of the head as a share of the width and of the sky height. */
  x: number;
  y: number;
  length: number;
  cycleMs: number;
  delayMs: number;
}

// Three meteors on different cycles: never more than a couple are visible at once.
const METEORS: MeteorSpec[] = [
  { x: 0.95, y: 0.05, length: 120, cycleMs: 7000, delayMs: 800 },
  { x: 0.7, y: 0.14, length: 90, cycleMs: 9000, delayMs: 3600 },
  { x: 1.05, y: 0.28, length: 140, cycleMs: 11500, delayMs: 6200 },
];

interface MeteorProps {
  spec: MeteorSpec;
  progress: SharedValue<number>;
  width: number;
  skyHeight: number;
}

/**
 * One streak in the sky and its faint, squashed reflection in the lake. The bar has its head
 * on the left and its tail on the right; it is rotated about the head so that the tail trails
 * behind the direction of travel (up and to the right). The head moves along that direction
 * with an ease-out, the tail stretches as it speeds up and shrinks as it burns out, and the
 * opacity rises and falls smoothly, so it never pops in or out.
 */
function Meteor({ spec, progress, width, skyHeight }: MeteorProps) {
  const { colors } = useTheme();
  const flight = FLIGHT_MS / spec.cycleMs;
  const travel = width * TRAVEL_SHARE;
  const headX = spec.x * width;
  const headY = spec.y * skyHeight;

  const sky = useAnimatedStyle(() => {
    // t goes 0 → 1 along the flight, then stays at 1 (hidden) until the cycle restarts.
    const pose = flightPose(Math.min(progress.value / flight, 1), travel);
    return {
      opacity: pose.opacity,
      transform: [
        { translateX: pose.dx },
        { translateY: pose.dy },
        { rotate: `${STREAK_ROTATION_DEG}deg` },
        { scaleX: pose.stretch },
      ],
    };
  });

  const lake = useAnimatedStyle(() => {
    const pose = flightPose(Math.min(progress.value / flight, 1), travel);
    const lakeY = skyHeight + (skyHeight - (headY + pose.dy)) * REFLECTION_SQUASH;
    return {
      opacity: pose.opacity * REFLECTION_OPACITY,
      transform: [
        { translateX: pose.dx },
        { translateY: lakeY - headY },
        { rotate: `${REFLECTION_ANGLE_DEG}deg` },
        { scaleX: pose.stretch },
      ],
    };
  });

  const bar = (length: number) => ({
    position: 'absolute' as const,
    left: headX,
    top: headY - STREAK_THICKNESS / 2,
    width: length,
    height: STREAK_THICKNESS,
    // The head is the fixed point: the tail is what stretches and trails.
    transformOrigin: 'left center' as const,
  });
  const { head, tail } = colors.meteor;
  // Bright head on the left, tail colour in the middle, fading to nothing on the right
  // (8-digit hex: the colour plus alpha 00).
  const fade: [string, string, string] = [head, tail, `${tail}00`];

  return (
    <>
      <Animated.View style={[bar(spec.length), sky]}>
        <LinearGradient
          colors={fade}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[bar(spec.length * REFLECTION_LENGTH), lake]}>
        <LinearGradient
          colors={fade}
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
      progress.value = (FLIGHT_MS / spec.cycleMs) * FROZEN_FLIGHT;
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
