import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '../../../shared/theme';
import { HILL_SHARE, LAKE_SHARE } from '../../../shared/ui/lakeLayout';

const REFLECTION_OPACITY = 0.35;
/** The lake squashes the reflection: it keeps this share of the sky's height and slope. */
const REFLECTION_SQUASH = 0.15;
/** Length of the reflection relative to the streak. */
const REFLECTION_LENGTH = 0.5;
/** Where the frozen frame stops for reduced motion: just before the middle of the flight. */
const FROZEN_FLIGHT = 0.45;
const FADE_STOPS = [0, 0.15, 0.6, 1];
const FADE_VALUES = [0, 1, 0.7, 0];
const STRETCH_STOPS = [0, 0.3, 1];
const STRETCH_VALUES = [0.15, 1, 0.35];

type Range = readonly [number, number];

/**
 * Everything about the shower is random, but only inside these limits, so that it always
 * looks like a calm sky: a streak now and then, sometimes a few close together, never a storm.
 */
export const LIMITS = {
  /** Start of the head as a share of the width and of the sky height. */
  x: [0.1, 1.1] as Range,
  y: [0, 0.45] as Range,
  length: [50, 190] as Range,
  thickness: [1, 3.5] as Range,
  /** Degrees below the horizontal, falling to the left. */
  angleDeg: [18, 38] as Range,
  /** Travel of the head, as a share of the screen width. */
  travelShare: [0.3, 0.75] as Range,
  flightMs: [900, 2100] as Range,
  /** Rest of one slot between two meteors, before the density factor. */
  gapMs: [1200, 7000] as Range,
  /** Wait before trying again when the sky is already as busy as it is allowed to be. */
  retryMs: [400, 1200] as Range,
  /** Meteors in flight at the same time (the sky is re-rolled within this range). */
  maxActive: [3, 7] as Range,
  /** Scale of the rests: below 1 is a busier sky, above 1 a calmer one. */
  gapScale: [0.5, 1.4] as Range,
  /** How long a density lasts before it is re-rolled. */
  densityMs: [15_000, 35_000] as Range,
};

/** Slots: the most meteors that can be on their way at once is `LIMITS.maxActive[1]`. */
export const SLOT_COUNT = 12;
/** With reduced motion nothing moves: a few frozen streaks keep the look of the screen. */
export const REDUCED_MOTION_COUNT = 5;

type Rng = () => number;

function between(rng: Rng, [min, max]: Range) {
  return min + rng() * (max - min);
}

export interface MeteorSpec {
  x: number;
  y: number;
  length: number;
  thickness: number;
  angleDeg: number;
  travelShare: number;
  flightMs: number;
  /** Index in the theme's colour variants (wraps around). */
  color: number;
}

/** A new meteor: random size, colour, angle, speed and starting point, inside `LIMITS`. */
export function randomMeteor(rng: Rng = Math.random): MeteorSpec {
  return {
    x: between(rng, LIMITS.x),
    y: between(rng, LIMITS.y),
    length: between(rng, LIMITS.length),
    thickness: between(rng, LIMITS.thickness),
    angleDeg: between(rng, LIMITS.angleDeg),
    travelShare: between(rng, LIMITS.travelShare),
    flightMs: between(rng, LIMITS.flightMs),
    color: Math.floor(rng() * 100),
  };
}

/** Random rest before a slot launches its next meteor. */
export function nextGapMs(gapScale: number, rng: Rng = Math.random) {
  return between(rng, LIMITS.gapMs) * gapScale;
}

/**
 * How busy the sky is: how many meteors may be in flight at once and how long the slots rest.
 * It is shared by all the slots and re-rolled every few seconds, so the rhythm of the shower
 * changes by itself (a quiet minute, then a few together).
 */
export class SkyDensity {
  /** Meteors in flight right now. */
  active = 0;
  maxActive = LIMITS.maxActive[0];
  gapScale = 1;
  private readonly rng: Rng;

  constructor(rng: Rng = Math.random) {
    this.rng = rng;
    this.reroll();
  }

  /** Picks a new density; returns how long to keep it. */
  reroll() {
    this.maxActive = Math.round(between(this.rng, LIMITS.maxActive));
    this.gapScale = between(this.rng, LIMITS.gapScale);
    return between(this.rng, LIMITS.densityMs);
  }

  /** Takes a place in the sky if there is room (a lowered limit never cuts meteors short). */
  tryLaunch() {
    if (this.active >= this.maxActive) return false;
    this.active += 1;
    return true;
  }

  land() {
    this.active = Math.max(0, this.active - 1);
  }
}

/** Unit vector of the head's motion on screen (y grows downwards): left and down. */
export function travelDirection(angleDeg: number) {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: -Math.cos(radians), y: Math.sin(radians) };
}

/** Rotation of the bar (degrees, clockwise on screen): negative lifts its right end, the tail. */
export function streakRotationDeg(angleDeg: number) {
  return -angleDeg;
}

/** Slope of the mirrored motion: same horizontal speed, vertical speed squashed and reversed. */
function reflectionRotationDeg(angleDeg: number) {
  const radians = (angleDeg * Math.PI) / 180;
  return (Math.atan(Math.tan(radians) * REFLECTION_SQUASH) * 180) / Math.PI;
}

/**
 * The travel of the head, shortened if it would end below `cropY` (the top of the hills): a
 * meteor ends in the sky, it never goes over the land.
 */
export function clampedTravel(travel: number, headY: number, cropY: number, angleDeg: number) {
  const room = (cropY - headY) / Math.sin((angleDeg * Math.PI) / 180);
  return Math.max(0, Math.min(travel, room));
}

/** Where a meteor is at ``t`` (0 → 1 along its flight): offset of the head, opacity, tail stretch. */
export function flightPose(t: number, travel: number, angleDeg: number) {
  'worklet';
  const radians = (angleDeg * Math.PI) / 180;
  const eased = 1 - (1 - t) * (1 - t);
  return {
    dx: -Math.cos(radians) * travel * eased,
    dy: Math.sin(radians) * travel * eased,
    opacity: interpolate(t, FADE_STOPS, FADE_VALUES, Extrapolation.CLAMP),
    stretch: interpolate(t, STRETCH_STOPS, STRETCH_VALUES, Extrapolation.CLAMP),
  };
}

interface MeteorProps {
  spec: MeteorSpec;
  /** 0 → 1 along the flight. */
  progress: SharedValue<number>;
  width: number;
  /** y of the waterline: the sky is above it and the lake below. */
  skyHeight: number;
  /** y where the hills begin: a meteor never goes below it, it passes behind them. */
  cropY: number;
}

/**
 * One streak in the sky and its faint, squashed reflection in the lake. The bar has its head
 * on the left and its tail on the right; it is rotated about the head so that the tail trails
 * behind the direction of travel (up and to the right). The head moves along that direction
 * with an ease-out, the tail stretches as it speeds up and shrinks as it burns out, and the
 * opacity rises and falls smoothly, so it never pops in or out.
 */
function Meteor({ spec, progress, width, skyHeight, cropY }: MeteorProps) {
  const { colors } = useTheme();
  const headX = spec.x * width;
  const headY = spec.y * skyHeight;
  const { angleDeg } = spec;
  const travel = clampedTravel(width * spec.travelShare, headY, cropY, angleDeg);
  const skyRotation = streakRotationDeg(angleDeg);
  const lakeRotation = reflectionRotationDeg(angleDeg);

  const sky = useAnimatedStyle(() => {
    const pose = flightPose(Math.min(Math.max(progress.value, 0), 1), travel, angleDeg);
    return {
      opacity: pose.opacity,
      transform: [
        { translateX: pose.dx },
        { translateY: pose.dy },
        { rotate: `${skyRotation}deg` },
        { scaleX: pose.stretch },
      ],
    };
  });

  const lake = useAnimatedStyle(() => {
    const pose = flightPose(Math.min(Math.max(progress.value, 0), 1), travel, angleDeg);
    const lakeY = skyHeight + (skyHeight - (headY + pose.dy)) * REFLECTION_SQUASH;
    return {
      opacity: pose.opacity * REFLECTION_OPACITY,
      transform: [
        { translateX: pose.dx },
        { translateY: lakeY - headY },
        { rotate: `${lakeRotation}deg` },
        { scaleX: pose.stretch },
      ],
    };
  });

  const bar = (length: number) => ({
    position: 'absolute' as const,
    left: headX,
    top: headY - spec.thickness / 2,
    width: length,
    height: spec.thickness,
    // The head is the fixed point: the tail is what stretches and trails.
    transformOrigin: 'left center' as const,
  });
  const palette = colors.meteors;
  const { head, tail } = palette[spec.color % palette.length];
  // Bright head on the left, tail colour in the middle, fading to nothing on the right
  // (8-digit hex: the colour plus alpha 00).
  const fade: [string, string, string] = [head, tail, `${tail}00`];

  return (
    <>
      {/* Clipped at the top of the hills: the streak ends in the sky, never over the land. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: cropY,
          overflow: 'hidden',
        }}
      >
        <Animated.View style={[bar(spec.length), sky]}>
          <LinearGradient
            colors={fade}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
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

interface SlotProps {
  width: number;
  skyHeight: number;
  cropY: number;
  density: SkyDensity;
}

/**
 * A place in the sky that launches one meteor after another: it rests a random time, takes
 * a place if the density allows it, flies a freshly rolled meteor, and starts over.
 */
function ShowerSlot({ width, skyHeight, cropY, density }: SlotProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [spec, setSpec] = useState<MeteorSpec>(() => randomMeteor());

  useEffect(() => {
    // Reduce motion: a calm still frame, halfway through the flight.
    if (reduceMotion) {
      progress.value = FROZEN_FLIGHT;
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let flying = false;

    const land = () => {
      if (!flying) return;
      flying = false;
      density.land();
    };
    const rest = (ms: number) => {
      timer = setTimeout(launch, ms);
    };
    const launch = () => {
      if (!density.tryLaunch()) {
        rest(between(Math.random, LIMITS.retryMs));
        return;
      }
      const next = randomMeteor();
      flying = true;
      progress.value = 0;
      setSpec(next);
      progress.value = withTiming(1, { duration: next.flightMs, easing: Easing.linear });
      timer = setTimeout(() => {
        land();
        rest(nextGapMs(density.gapScale));
      }, next.flightMs);
    };
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      land();
      cancelAnimation(progress);
      progress.value = 0;
    };

    rest(between(Math.random, [0, LIMITS.gapMs[1]]));
    // Nothing moves while the app is in the background.
    const subscription = AppState.addEventListener('change', (state) => {
      stop();
      if (state === 'active') rest(nextGapMs(density.gapScale));
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [reduceMotion, progress, density]);

  return (
    <Meteor spec={spec} progress={progress} width={width} skyHeight={skyHeight} cropY={cropY} />
  );
}

/**
 * The memorable element of the sign-in screen: Perseids crossing the sky at a random rhythm,
 * each one with its own size, colour, angle, speed and starting point, and a faint reflection
 * in the lake. It is drawn before the content of the screen, so every meteor passes behind
 * the title, the panel and the button, never over them. Decorative, so hidden from screen
 * readers; it never takes touches.
 */
export function PerseidShower() {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const skyHeight = height * (1 - LAKE_SHARE);
  const cropY = height * (1 - LAKE_SHARE - HILL_SHARE);
  const [density] = useState(() => new SkyDensity());

  // The density of the sky changes by itself every few seconds.
  useEffect(() => {
    if (reduceMotion) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const roll = () => {
      timer = setTimeout(roll, density.reroll());
    };
    roll();
    return () => clearTimeout(timer);
  }, [density, reduceMotion]);

  const slots = reduceMotion ? REDUCED_MOTION_COUNT : SLOT_COUNT;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: slots }, (_, index) => (
        <ShowerSlot
          key={index}
          width={width}
          skyHeight={skyHeight}
          cropY={cropY}
          density={density}
        />
      ))}
    </View>
  );
}
