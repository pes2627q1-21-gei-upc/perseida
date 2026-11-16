import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
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
} from 'react-native-reanimated';
import Svg, {
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useTheme } from '../theme';
import {
  BANKS_HEIGHT,
  BANKS_WIDTH,
  HILL_REFLECTION_SHARE,
  HILL_SHARE,
  LAKE_SHARE,
  LIGHT_X,
  blades,
  bubbles,
  flowers,
  glints,
  lilyPads,
  reeds,
  shoreline,
  tufts,
  waves,
  type Bubble,
  type Glint,
  type LilyPad,
  type Reed,
  type Tuft,
  type Wave,
} from './lakeLayout';

/**
 * The lake of the "Cel viu" scene (cel-viu.md). It is drawn in two layers so that things can
 * pass between them: `LakeWater` (sun or moon, hills, the water with its light) goes under
 * the content of the scene, and `LakeBanks` (the meadow around the water, reeds, flowers and
 * tall grass) goes over it, so the meadow itself carves the shape of the lake out of the
 * water, and the reflections of the meteors never spill over the grass.
 */

/** Alpha suffix for the 6-digit hex tokens (8-digit hex: colour plus alpha). */
const alpha = (hex: string, value: number) =>
  `${hex}${Math.round(value * 255)
    .toString(16)
    .padStart(2, '0')}`;

/** 0 → 1 loop (back and forth when `reverse`); frozen at `still` with reduced motion. */
function useLoop(periodMs: number, delayMs: number, reverse: boolean, still: number) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(still);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = still;
      return undefined;
    }
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, { duration: periodMs, easing: Easing.inOut(Easing.sin) }),
        -1,
        reverse,
      ),
    );
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress, periodMs, delayMs, reverse, still]);

  return progress;
}

// Hills in a 400 x 100 box (y = 100 is the waterline). The valley on the right lets the
// sun or the moon show between them.
const FAR_HILLS =
  'M0 62 C40 40 85 52 130 44 S190 56 240 62 S300 66 340 60 S380 40 400 46 L400 100 L0 100 Z';
const FAR_CREST = 'M0 62 C40 40 85 52 130 44 S190 56 240 62 S300 66 340 60 S380 40 400 46';
const NEAR_LEFT = 'M0 76 C30 54 72 64 112 60 S172 82 204 100 L0 100 Z';
const NEAR_LEFT_CREST = 'M0 76 C30 54 72 64 112 60 S172 82 204 100';
const NEAR_RIGHT = 'M400 68 C362 50 322 60 292 76 S252 92 238 100 L400 100 Z';
const NEAR_RIGHT_CREST = 'M400 68 C362 50 322 60 292 76 S252 92 238 100';

function Light({
  width,
  hillHeight,
  waterHeight,
}: {
  width: number;
  hillHeight: number;
  waterHeight: number;
}) {
  const { colors } = useTheme();
  const { glow } = colors.lake;
  const height = hillHeight * 2.8;
  const radius = hillHeight * 1.9;
  const pulse = useLoop(6500, 0, true, 0.5);
  const style = useAnimatedStyle(() => ({ opacity: 0.82 + 0.18 * pulse.value }));

  return (
    <Animated.View
      style={[{ position: 'absolute', left: 0, bottom: waterHeight, width, height }, style]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient
            id="light"
            cx={LIGHT_X * width}
            cy={height - hillHeight * 0.34}
            r={radius}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={glow} stopOpacity="1" />
            <Stop offset="0.16" stopColor={glow} stopOpacity="0.85" />
            <Stop offset="0.42" stopColor={glow} stopOpacity="0.32" />
            <Stop offset="1" stopColor={glow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#light)" />
      </Svg>
    </Animated.View>
  );
}

function Hills({ width, height }: { width: number; height: number }) {
  const { colors } = useTheme();
  const { hillFar, hillNear, rim } = colors.lake;

  return (
    <Svg width={width} height={height} viewBox="0 0 400 100" preserveAspectRatio="none">
      <Path d={FAR_HILLS} fill={hillFar} />
      <Path d={FAR_CREST} fill="none" stroke={alpha(rim, 0.35)} strokeWidth={1.2} />
      <Path d={NEAR_LEFT} fill={hillNear} />
      <Path d={NEAR_RIGHT} fill={hillNear} />
      <Path d={NEAR_LEFT_CREST} fill="none" stroke={alpha(rim, 0.55)} strokeWidth={1.4} />
      <Path d={NEAR_RIGHT_CREST} fill="none" stroke={alpha(rim, 0.55)} strokeWidth={1.4} />
    </Svg>
  );
}

interface WaterProps {
  width: number;
  waterHeight: number;
  color: string;
}

function WaveLine({ wave, width, waterHeight, color }: WaterProps & { wave: Wave }) {
  const progress = useLoop(wave.periodMs, wave.delayMs, true, 0.5);
  const style = useAnimatedStyle(() => ({
    opacity: wave.opacity * (0.5 + 0.5 * progress.value),
    transform: [{ translateX: (progress.value - 0.5) * 2 * wave.amplitude }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: wave.x * width,
          top: wave.depth * waterHeight,
          width: wave.width * width,
          height: wave.height,
          borderRadius: wave.height,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function GlintDash({ glint, width, waterHeight, color }: WaterProps & { glint: Glint }) {
  const progress = useLoop(glint.periodMs, glint.delayMs, true, 0.7);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.08, 0.95], Extrapolation.CLAMP),
    transform: [{ scaleX: 0.55 + 0.45 * progress.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: LIGHT_X * width + glint.dx - glint.width / 2,
          top: glint.depth * waterHeight,
          width: glint.width,
          height: 2 + glint.depth * 2,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function GlassBubble({ bubble, width, waterHeight, color }: WaterProps & { bubble: Bubble }) {
  const progress = useLoop(bubble.periodMs, bubble.delayMs, false, 0.4);
  const rise = bubble.rise * waterHeight;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.8, 1], [0, 0.9, 0.6, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: -progress.value * rise },
      { translateX: Math.sin(progress.value * Math.PI * 2 * bubble.swayTurns) * bubble.sway },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: bubble.x * width,
          bottom: waterHeight * 0.2,
          width: bubble.size,
          height: bubble.size,
          borderRadius: bubble.size / 2,
          borderWidth: 1.2,
          borderColor: alpha(color, 0.7),
          backgroundColor: alpha(color, 0.12),
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          left: bubble.size * 0.2,
          top: bubble.size * 0.16,
          width: bubble.size * 0.26,
          height: bubble.size * 0.16,
          borderRadius: bubble.size,
          backgroundColor: alpha(color, 0.85),
        }}
      />
    </Animated.View>
  );
}

const PADS = lilyPads();

/** A lily pad with a notch and a gleam, and on some of them a water lily in bloom. */
function LilyPadView({
  pad,
  width,
  waterHeight,
}: {
  pad: LilyPad;
  width: number;
  waterHeight: number;
}) {
  const { colors } = useTheme();
  const lake = colors.lake;
  const progress = useLoop(pad.periodMs, pad.delayMs, true, 0.5);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: (progress.value - 0.5) * 2.4 },
      { rotate: `${(progress.value - 0.5) * 4}deg` },
    ],
  }));
  const height = pad.size * 0.42;
  // Five petals fanned out around the middle of the flower.
  const petals = [-64, -32, 0, 32, 64];

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: pad.x * width - pad.size / 2,
          top: pad.y * waterHeight - height / 2,
          width: pad.size,
          height,
        },
        style,
      ]}
    >
      <Svg width={pad.size} height={height} viewBox="0 0 100 42">
        <Ellipse
          cx="50"
          cy="21"
          rx="48"
          ry="19"
          fill={lake.grassLight}
          stroke={lake.grassDark}
          strokeWidth="2.5"
        />
        <Path d="M50 21 L97 11 L97 24 Z" fill={alpha(lake.waterBottom, 0.75)} />
        <Ellipse cx="36" cy="14" rx="22" ry="5.5" fill={alpha(lake.rim, 0.5)} />
      </Svg>
      {pad.flower && (
        <View style={{ position: 'absolute', left: pad.size * 0.3, top: -pad.size * 0.3 }}>
          <Svg width={pad.size * 0.4} height={pad.size * 0.3} viewBox="0 0 40 30">
            {petals.map((angle) => (
              <Ellipse
                key={angle}
                cx="20"
                cy="14"
                rx="4.2"
                ry="12"
                fill={lake.flowers[0]}
                stroke={alpha(lake.grassDark, 0.5)}
                strokeWidth="0.7"
                transform={`rotate(${angle} 20 26)`}
              />
            ))}
            <Ellipse cx="20" cy="24" rx="3.4" ry="2.6" fill={lake.flowers[1]} />
          </Svg>
        </View>
      )}
    </Animated.View>
  );
}

const WAVES = waves();
const GLINTS = glints();
const BUBBLES = bubbles();

/**
 * Sun or moon, hills and the water with everything that happens on it: the reflected hills,
 * a column of glittering light under the sun or the moon, wavelets that drift sideways, a
 * gloss on the surface and glass bubbles rising from the depth.
 */
export function LakeWater() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const lake = colors.lake;
  const waterHeight = height * LAKE_SHARE;
  const hillHeight = height * HILL_SHARE;
  const common = { width, waterHeight, color: lake.glitter };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {/* The light first: the hills are in front of the sun or the moon. */}
      <Light width={width} hillHeight={hillHeight} waterHeight={waterHeight} />
      <View
        style={{ position: 'absolute', left: 0, bottom: waterHeight, width, height: hillHeight }}
      >
        <Hills width={width} height={hillHeight} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width,
          height: waterHeight,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={[lake.waterTop, lake.waterBottom]}
          style={StyleSheet.absoluteFill}
        />
        {/* The hills, upside down and faint, as the water shows them. */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            width,
            height: hillHeight * HILL_REFLECTION_SHARE,
            opacity: 0.32,
            transform: [{ scaleY: -1 }],
          }}
        >
          <Hills width={width} height={hillHeight * HILL_REFLECTION_SHARE} />
        </View>
        {/* Column of light under the sun or the moon. */}
        <Svg width={width} height={waterHeight} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="column" cx="0.5" cy="0.04" rx="0.5" ry="0.95">
              <Stop offset="0" stopColor={lake.glitter} stopOpacity="0.6" />
              <Stop offset="0.45" stopColor={lake.glow} stopOpacity="0.22" />
              <Stop offset="1" stopColor={lake.glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect
            x={LIGHT_X * width - width * 0.16}
            y="0"
            width={width * 0.32}
            height={waterHeight}
            fill="url(#column)"
          />
        </Svg>
        {/* Depth: the water darkens towards the viewer. */}
        <LinearGradient
          colors={[alpha(lake.waterBottom, 0), alpha(lake.waterBottom, 0.6)]}
          start={{ x: 0, y: 0.25 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {WAVES.map((wave, index) => (
          <WaveLine key={`wave-${index}`} wave={wave} {...common} />
        ))}
        {PADS.map((pad, index) => (
          <LilyPadView key={`pad-${index}`} pad={pad} width={width} waterHeight={waterHeight} />
        ))}
        {GLINTS.map((glint, index) => (
          <GlintDash key={`glint-${index}`} glint={glint} {...common} />
        ))}
        {BUBBLES.map((bubble, index) => (
          <GlassBubble key={`bubble-${index}`} bubble={bubble} {...common} />
        ))}
        {/* Gloss of the surface (Frutiger): a bright edge and a soft band under it. */}
        <LinearGradient
          colors={[alpha(lake.glitter, 0.42), alpha(lake.glitter, 0)]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: waterHeight * 0.12 }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 1.5,
            backgroundColor: alpha(lake.glitter, 0.75),
          }}
        />
      </View>
    </View>
  );
}

const SHORE = shoreline();
const BLADES = blades();
const FLOWERS = flowers();
const REEDS = reeds();
const TUFTS = tufts();

// The meadow: the whole box with the lake cut out of it (even-odd), so that the edge of the
// water is exactly the shoreline.
const MEADOW = `M0 0 H${BANKS_WIDTH} V${BANKS_HEIGHT} H0 Z M${SHORE.map(({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`;
const SHORELINE = `M${SHORE.map(({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`;
const bladePath = (dx: number, dy: number) =>
  BLADES.map(
    ({ x, y, height, lean }) =>
      `M${(x - 1.1 + dx).toFixed(1)} ${(y + dy).toFixed(1)} L${(x + lean + dx).toFixed(1)} ${(
        y -
        height +
        dy
      ).toFixed(1)} L${(x + 1.1 + dx).toFixed(1)} ${(y + dy).toFixed(1)} Z`,
  ).join(' ');

function SwayingReed({
  reed,
  width,
  waterHeight,
}: {
  reed: Reed;
  width: number;
  waterHeight: number;
}) {
  const { colors } = useTheme();
  const progress = useLoop(reed.periodMs, reed.delayMs, true, 0.5);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${reed.lean + (progress.value - 0.5) * 2 * reed.swayDeg}deg` }],
  }));
  const stem = colors.lake.grassDark;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: (reed.x / BANKS_WIDTH) * width - 3,
          top: (reed.y / BANKS_HEIGHT) * waterHeight - reed.height,
          width: 6,
          height: reed.height,
          alignItems: 'center',
          transformOrigin: 'bottom center',
        },
        style,
      ]}
    >
      <View
        style={{
          width: 5.5,
          height: reed.height * 0.3,
          borderRadius: 3,
          backgroundColor: colors.lake.hillNear,
          borderWidth: 0.6,
          borderColor: alpha(colors.lake.rim, 0.6),
        }}
      />
      <View style={{ width: 1.8, flex: 1, backgroundColor: stem }} />
    </Animated.View>
  );
}

function TallGrass({ tuft, width }: { tuft: Tuft; width: number }) {
  const { colors } = useTheme();
  const progress = useLoop(tuft.periodMs, tuft.delayMs, true, 0.5);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(progress.value - 0.5) * 2 * tuft.swayDeg}deg` }],
  }));
  const tuftWidth = Math.max(40, tuft.height * 0.9);
  const half = tuftWidth / 2;
  // A fan of blades: each one a curved sliver from the foot to its tip.
  const bladeCount = 9;
  const paths = Array.from({ length: bladeCount }, (_, i) => {
    const t = i / (bladeCount - 1) - 0.5;
    const tipX = half + t * tuftWidth * 0.95;
    const tipY = tuft.height * (0.22 + 0.78 * (1 - Math.abs(t) * 1.15)) * (i % 2 === 0 ? 1 : 0.8);
    const footX = half + t * tuftWidth * 0.3;
    return {
      d: `M${footX - 2} ${tuft.height} Q${footX + t * 8} ${tuft.height - tipY * 0.55} ${tipX} ${tuft.height - tipY} Q${
        footX + t * 8 + 3
      } ${tuft.height - tipY * 0.5} ${footX + 2} ${tuft.height} Z`,
      light: i % 2 === 0,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: tuft.x * width - (tuft.x > 0.5 ? tuftWidth * 0.4 : 0),
          bottom: -2,
          width: tuftWidth,
          height: tuft.height,
          transformOrigin: 'bottom center',
        },
        style,
      ]}
    >
      <Svg width={tuftWidth} height={tuft.height}>
        {paths.map(({ d, light }, index) => (
          <Path
            key={index}
            d={d}
            fill={light ? colors.lake.grassLight : colors.lake.grassDark}
            stroke={light ? alpha(colors.lake.rim, 0.5) : 'none'}
            strokeWidth={0.6}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

/**
 * The meadow around the water: a bank on each side and one in the foreground, with a wet dark
 * edge and a rim of light where it meets the water, blades of grass, wild flowers, reeds with
 * cattails and tall grass that sways in the wind. Opaque, so it cuts the shape of the lake out
 * of the rectangle of water under it.
 */
export function LakeBanks() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const lake = colors.lake;
  const waterHeight = height * LAKE_SHARE;
  const flowerColors = lake.flowers;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, bottom: 0, width, height: waterHeight }}
    >
      <Svg
        width={width}
        height={waterHeight}
        viewBox={`0 0 ${BANKS_WIDTH} ${BANKS_HEIGHT}`}
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <SvgLinearGradient id="meadow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lake.grassLight} />
            <Stop offset="1" stopColor={lake.grassDark} />
          </SvgLinearGradient>
        </Defs>
        <Path d={MEADOW} fill="url(#meadow)" fillRule="evenodd" />
        {/* Wet edge and the light that runs along the shore. */}
        <Path d={SHORELINE} fill="none" stroke={alpha(lake.grassDark, 0.7)} strokeWidth={3.2} />
        <Path d={SHORELINE} fill="none" stroke={alpha(lake.rim, 0.9)} strokeWidth={1.1} />
        <Path d={bladePath(0.9, 0.7)} fill={lake.grassDark} />
        <Path d={bladePath(0, 0)} fill={lake.grassLight} />
      </Svg>
      {REEDS.map((reed, index) => (
        <SwayingReed key={`reed-${index}`} reed={reed} width={width} waterHeight={waterHeight} />
      ))}
      {/* Mist over the far shore, lit by the sun or the moon. */}
      <LinearGradient
        colors={[alpha(lake.glow, 0.4), alpha(lake.glow, 0)]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: waterHeight * 0.1 }}
      />
      {FLOWERS.map((flower, index) => (
        <View
          key={`flower-${index}`}
          style={{
            position: 'absolute',
            left: flower.x * width,
            top: flower.y * waterHeight,
            width: flower.size,
            height: flower.size,
            borderRadius: flower.size / 2,
            backgroundColor: flowerColors[flower.color % flowerColors.length],
            borderWidth: 0.5,
            borderColor: alpha(lake.grassDark, 0.5),
          }}
        />
      ))}
      {TUFTS.map((tuft, index) => (
        <TallGrass key={`tuft-${index}`} tuft={tuft} width={width} />
      ))}
    </View>
  );
}
