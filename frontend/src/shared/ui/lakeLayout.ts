// Geometry of the lake of the "Cel viu" scene. Everything that looks random (waves, glitter,
// bubbles, flowers...) is generated here from a fixed seed, so it is the same on every render
// and on every device, and so it can be tested.

/** Share of the screen height taken by the water. */
export const LAKE_SHARE = 0.3;
/** Share of the screen height taken by the hills above the waterline. */
export const HILL_SHARE = 0.12;
/** Horizontal position (share of the width) of the sun or moon and of its glitter. */
export const LIGHT_X = 0.7;

// The banks are drawn in a 400 x 200 box that covers the water (y = 0 is the far shore,
// y = 200 the bottom of the screen) and is stretched to the real size.
export const BANKS_WIDTH = 400;
export const BANKS_HEIGHT = 200;

/** Deterministic pseudo-random numbers (mulberry32). */
export function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

// The water is a squared oval (a superellipse): wide, with soft corners, and a little
// narrower at the far shore, where it recedes into the hills.
const LAKE_CENTRE_X = BANKS_WIDTH / 2;
const LAKE_CENTRE_Y = 98;
const LAKE_RADIUS_X = 198;
const LAKE_RADIUS_Y = 88;
const LAKE_ROUNDNESS = 2.4;

/** Half the width of the water at depth y (0 when y is outside the lake). */
function halfWidth(y: number) {
  const dy = Math.abs(y - LAKE_CENTRE_Y) / LAKE_RADIUS_Y;
  if (dy >= 1) return 0;
  return LAKE_RADIUS_X * (1 - dy ** LAKE_ROUNDNESS) ** (1 / LAKE_ROUNDNESS);
}

/**
 * x of the left shore at depth y (0 far, 200 near). A little wobble keeps the shore from
 * being a perfect curve.
 */
export function leftShoreX(y: number) {
  return LAKE_CENTRE_X - halfWidth(y) + 4 * Math.sin(y / 17);
}

/** x of the right shore at depth y. */
export function rightShoreX(y: number) {
  return LAKE_CENTRE_X + halfWidth(y) - 5 * Math.sin(y / 21 + 1);
}

/** y of the near shore at x: the lower edge of the oval. Outside the oval it is its middle. */
export function nearShoreY(x: number) {
  const dx = Math.abs(x - LAKE_CENTRE_X) / LAKE_RADIUS_X;
  const depth = dx >= 1 ? 0 : LAKE_RADIUS_Y * (1 - dx ** LAKE_ROUNDNESS) ** (1 / LAKE_ROUNDNESS);
  return LAKE_CENTRE_Y + depth + 3 * Math.sin(x / 13);
}

/** Inside the oval, `grow` units larger (negative: smaller). Banks coordinates. */
function insideOval(x: number, y: number, grow = 0) {
  const dx = Math.abs(x - LAKE_CENTRE_X) / (LAKE_RADIUS_X + grow);
  const dy = Math.abs(y - LAKE_CENTRE_Y) / (LAKE_RADIUS_Y + grow);
  return dx ** LAKE_ROUNDNESS + dy ** LAKE_ROUNDNESS < 1;
}

/** Where the water really is, in banks coordinates: used to keep the effects inside it. */
export function isWater(x: number, y: number) {
  return insideOval(x, y);
}

export interface Wave {
  /** Left edge and depth (0 far shore, 1 near shore) as shares of the water. */
  x: number;
  depth: number;
  /** Width as a share of the screen width and height in px. */
  width: number;
  height: number;
  /** Sway in px, period and delay in ms, and base opacity. */
  amplitude: number;
  periodMs: number;
  delayMs: number;
  opacity: number;
}

/** Thin bright lines that drift on the water: thinner and denser near the far shore. */
export function waves(count = 14, seed = 11): Wave[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const depth = 0.05 + 0.9 * ((i + rng() * 0.8) / count) ** 1.3;
    return {
      x: between(rng, 0.05, 0.6),
      depth,
      width: between(rng, 0.18, 0.5) * (0.6 + depth * 0.6),
      height: 1 + depth * 2.2,
      amplitude: between(rng, 8, 26) * (0.5 + depth),
      periodMs: between(rng, 3200, 7200),
      delayMs: between(rng, 0, 4000),
      opacity: between(rng, 0.14, 0.34),
    };
  });
}

export interface Glint {
  depth: number;
  /** Offset from the column of light, in px, and width in px. */
  dx: number;
  width: number;
  periodMs: number;
  delayMs: number;
}

/** Dashes of light under the sun or the moon: a column that widens towards the viewer. */
export function glints(count = 16, seed = 29): Glint[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const depth = 0.04 + (0.9 * (i + 0.5)) / count;
    return {
      depth,
      dx: between(rng, -1, 1) * (6 + depth * 54),
      width: between(rng, 0.5, 1) * (8 + depth * 70),
      periodMs: between(rng, 1100, 3400),
      delayMs: between(rng, 0, 3000),
    };
  });
}

export interface Bubble {
  /** Position across the water, as a share of the width (never over the banks). */
  x: number;
  size: number;
  /** How far it rises, as a share of the water height, and how long it takes. */
  rise: number;
  periodMs: number;
  delayMs: number;
  sway: number;
  swayTurns: number;
}

/** Glass bubbles that rise slowly through the water. */
export function bubbles(count = 7, seed = 47): Bubble[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: between(rng, 0.24, 0.76),
    size: between(rng, 8, 22),
    rise: between(rng, 0.35, 0.6),
    periodMs: between(rng, 7000, 14000),
    delayMs: between(rng, 0, 9000),
    sway: between(rng, 4, 14),
    swayTurns: between(rng, 1, 2.5),
  }));
}

export interface Blade {
  x: number;
  y: number;
  height: number;
  lean: number;
}

/** Blades of grass all along the edge of the water, as points in banks coordinates. */
export function blades(seed = 71): Blade[] {
  const rng = seeded(seed);
  return shoreline(150).map(({ x, y }) => ({
    x: x + between(rng, -1.5, 1.5),
    y,
    height: between(rng, 3.2, 8.5),
    lean: between(rng, -2.6, 2.6),
  }));
}

export interface Flower {
  /** Position as shares of the width and of the water height. */
  x: number;
  y: number;
  size: number;
  color: number;
}

/** Wild flowers scattered over the meadow, never in the water. */
export function flowers(count = 22, seed = 97): Flower[] {
  const rng = seeded(seed);
  const result: Flower[] = [];
  let guard = 0;
  while (result.length < count && guard < 5000) {
    guard += 1;
    const x = between(rng, 0, BANKS_WIDTH);
    const y = between(rng, 6, BANKS_HEIGHT - 6);
    if (insideOval(x, y, 9)) continue;
    result.push({
      x: x / BANKS_WIDTH,
      y: y / BANKS_HEIGHT,
      size: between(rng, 2.6, 5),
      color: Math.floor(rng() * 100),
    });
  }
  return result;
}

export interface Tuft {
  /** Left edge as a share of the width; the foot is at the bottom of the screen. */
  x: number;
  height: number;
  swayDeg: number;
  periodMs: number;
  delayMs: number;
}

/** Tall grass in the foreground corners, swaying in the wind. */
export function tufts(seed = 5): Tuft[] {
  const rng = seeded(seed);
  return [0.0, 0.1, 0.22, 0.74, 0.86, 0.95].map((x) => ({
    x,
    height: between(rng, 38, 68),
    swayDeg: between(rng, 1.8, 3.6),
    periodMs: between(rng, 3200, 5200),
    delayMs: between(rng, 0, 2500),
  }));
}

export interface Reed {
  /** Position in banks coordinates (the foot) and size in px. */
  x: number;
  y: number;
  height: number;
  lean: number;
  swayDeg: number;
  periodMs: number;
  delayMs: number;
}

/** Reeds with cattails at the edge of the water: the clearest sign that this is a lake. */
export function reeds(seed = 61): Reed[] {
  const rng = seeded(seed);
  const spots = [
    ...[24, 44, 64, 84, 108].map((y) => ({ x: leftShoreX(y) + 2, y })),
    ...[30, 52, 72, 96, 122].map((y) => ({ x: rightShoreX(y) - 2, y })),
  ];
  return spots.map(({ x, y }) => ({
    x,
    y,
    height: between(rng, 30, 56),
    lean: between(rng, -5, 5),
    swayDeg: between(rng, 2, 4.5),
    periodMs: between(rng, 2600, 4800),
    delayMs: between(rng, 0, 2500),
  }));
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The edge of the water, in banks coordinates: a closed loop, once around the lake. The
 * meadow is drawn outside it and the rim light follows it.
 */
export function shoreline(count = 260): Point[] {
  const power = 2 / LAKE_ROUNDNESS;
  const signedPower = (value: number) => Math.sign(value) * Math.abs(value) ** power;
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    const x = LAKE_CENTRE_X + LAKE_RADIUS_X * signedPower(Math.cos(angle));
    const y = LAKE_CENTRE_Y + LAKE_RADIUS_Y * signedPower(Math.sin(angle));
    // The same little wobble as the side shores, so that the edge is not a perfect curve.
    return {
      x: x + 3 * Math.sin(y / 17) * (x < LAKE_CENTRE_X ? 1 : -1),
      y: y + 2.5 * Math.sin(x / 13) * (y > LAKE_CENTRE_Y ? 1 : -1),
    };
  });
}

export interface LilyPad {
  /** Centre as shares of the width and of the water height. */
  x: number;
  y: number;
  /** Width in px. */
  size: number;
  /** Whether a water lily blooms on it. */
  flower: boolean;
  periodMs: number;
  delayMs: number;
}

/** Lily pads floating on the left of the water, away from the column of light. */
export function lilyPads(count = 5, seed = 83): LilyPad[] {
  const rng = seeded(seed);
  const pads: LilyPad[] = [];
  let guard = 0;
  while (pads.length < count && guard < 5000) {
    guard += 1;
    const x = between(rng, 40, 250);
    const y = between(rng, 45, 165);
    // Well inside the water, and not on top of another pad.
    if (!insideOval(x, y, -30)) continue;
    if (pads.some((pad) => Math.hypot(pad.x * BANKS_WIDTH - x, pad.y * BANKS_HEIGHT - y) < 55)) {
      continue;
    }
    pads.push({
      x: x / BANKS_WIDTH,
      y: y / BANKS_HEIGHT,
      size: between(rng, 26, 46),
      flower: pads.length % 2 === 0,
      periodMs: between(rng, 3800, 6200),
      delayMs: between(rng, 0, 3000),
    });
  }
  return pads;
}
