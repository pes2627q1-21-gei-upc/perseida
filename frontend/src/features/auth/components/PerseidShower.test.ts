jest.mock('react-native-reanimated', () => ({
  Easing: {},
  Extrapolation: { CLAMP: 'clamp' },
  // Piecewise-linear like the real one, clamped at both ends.
  interpolate: (x: number, input: number[], output: number[]) => {
    if (x <= input[0]) return output[0];
    for (let i = 1; i < input.length; i += 1) {
      if (x <= input[i]) {
        const ratio = (x - input[i - 1]) / (input[i] - input[i - 1]);
        return output[i - 1] + ratio * (output[i] - output[i - 1]);
      }
    }
    return output[output.length - 1];
  },
}));

import { colors } from '../../../shared/theme/colors';
import {
  LIMITS,
  REDUCED_MOTION_COUNT,
  SLOT_COUNT,
  SkyDensity,
  clampedTravel,
  flightPose,
  nextGapMs,
  randomMeteor,
  reflectionDepth,
  streakRotationDeg,
  travelDirection,
} from './PerseidShower';

/** Deterministic pseudo-random numbers (mulberry32), so the statistical tests do not flake. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRAVEL = 400;
const ANGLES = [20, 28, 36];

describe('PerseidShower geometry', () => {
  it.each(ANGLES)('falls to the lower left at %i° (y grows downwards on screen)', (angle) => {
    const pose = flightPose(0.5, TRAVEL, angle);

    expect(pose.dx).toBeLessThan(0);
    expect(pose.dy).toBeGreaterThan(0);
    expect(travelDirection(angle).x).toBeLessThan(0);
    expect(travelDirection(angle).y).toBeGreaterThan(0);
  });

  it.each(ANGLES)('moves along its own direction at %i°', (angle) => {
    const { dx, dy } = flightPose(0.7, TRAVEL, angle);
    const direction = travelDirection(angle);

    expect(dy / dx).toBeCloseTo(direction.y / direction.x, 6);
  });

  it.each(ANGLES)('trails its tail behind the head at %i°: the bar points opposite', (angle) => {
    // RN rotates clockwise on screen: a bar whose head is on the left and tail on the right
    // points along (cos, sin) of the rotation once rotated about the head.
    const radians = (streakRotationDeg(angle) * Math.PI) / 180;
    const tail = { x: Math.cos(radians), y: Math.sin(radians) };
    const direction = travelDirection(angle);

    expect(tail.x * direction.x + tail.y * direction.y).toBeCloseTo(-1, 6);
    expect(tail.x).toBeGreaterThan(0);
    expect(tail.y).toBeLessThan(0);
  });

  it('only ever moves forward: the head never goes back', () => {
    const steps = Array.from({ length: 21 }, (_, i) => flightPose(i / 20, TRAVEL, 28));

    steps.slice(1).forEach((pose, i) => {
      expect(pose.dx).toBeLessThanOrEqual(steps[i].dx);
      expect(pose.dy).toBeGreaterThanOrEqual(steps[i].dy);
    });
  });

  it('is invisible at both ends of the flight and visible in between: no pop in or out', () => {
    expect(flightPose(0, TRAVEL, 28).opacity).toBe(0);
    expect(flightPose(1, TRAVEL, 28).opacity).toBe(0);
    expect(flightPose(0.3, TRAVEL, 28).opacity).toBeGreaterThan(0.5);
  });

  it('fades smoothly: no jump in opacity between neighbouring frames', () => {
    const opacities = Array.from(
      { length: 101 },
      (_, i) => flightPose(i / 100, TRAVEL, 28).opacity,
    );

    opacities.slice(1).forEach((opacity, i) => {
      expect(Math.abs(opacity - opacities[i])).toBeLessThan(0.1);
    });
  });

  it('draws the tail longer at full speed than at the start and at the end', () => {
    const start = flightPose(0, TRAVEL, 28).stretch;
    const middle = flightPose(0.3, TRAVEL, 28).stretch;
    const end = flightPose(1, TRAVEL, 28).stretch;

    expect(middle).toBeGreaterThan(start);
    expect(middle).toBeGreaterThan(end);
  });
});

const within = (value: number, [min, max]: readonly [number, number]) =>
  value >= min && value <= max;

describe('meteors and the hills', () => {
  it('keep their whole travel when there is room above the hills', () => {
    expect(clampedTravel(300, 100, 600, 28)).toBe(300);
  });

  it('shorten the travel so that the head ends above the top of the hills', () => {
    const travel = clampedTravel(500, 400, 480, 30);
    const endY = 400 + Math.sin((30 * Math.PI) / 180) * travel;

    expect(travel).toBeLessThan(500);
    expect(endY).toBeLessThanOrEqual(480 + 1e-9);
  });

  it('never go below the hills for any meteor the shower can roll', () => {
    const cropY = 560;
    const skyHeight = 650;
    const rng = seeded(99);
    for (let i = 0; i < 2000; i += 1) {
      const meteor = randomMeteor(rng);
      const headY = meteor.y * skyHeight;
      const travel = clampedTravel(390 * meteor.travelShare, headY, cropY, meteor.angleDeg);
      const endY = headY + Math.sin((meteor.angleDeg * Math.PI) / 180) * travel;

      expect(travel).toBeGreaterThanOrEqual(0);
      expect(endY).toBeLessThanOrEqual(cropY + 1e-9);
    }
  });
});

describe('reflections', () => {
  const SKY_HEIGHT = 650;
  const WATER_HEIGHT = 280;

  it('start at the waterline and go down into the water, never up into the air', () => {
    expect(reflectionDepth(SKY_HEIGHT, SKY_HEIGHT)).toBe(0);
    expect(reflectionDepth(300, SKY_HEIGHT)).toBeGreaterThan(0);
    // Even for a point that is (wrongly) below the waterline, the depth is never negative.
    expect(reflectionDepth(SKY_HEIGHT + 50, SKY_HEIGHT)).toBe(0);
  });

  it('the higher the meteor, the deeper its reflection', () => {
    expect(reflectionDepth(100, SKY_HEIGHT)).toBeGreaterThan(reflectionDepth(400, SKY_HEIGHT));
  });

  it('stay inside the water for every meteor the shower can roll and at every moment', () => {
    const rng = seeded(321);
    for (let i = 0; i < 1000; i += 1) {
      const meteor = randomMeteor(rng);
      const headY = meteor.y * SKY_HEIGHT;
      const travel = clampedTravel(390 * meteor.travelShare, headY, 560, meteor.angleDeg);
      for (let t = 0; t <= 1; t += 0.1) {
        const pose = flightPose(t, travel, meteor.angleDeg);
        const depth = reflectionDepth(headY + pose.dy, SKY_HEIGHT);

        expect(depth).toBeGreaterThanOrEqual(0);
        expect(depth).toBeLessThan(WATER_HEIGHT);
      }
    }
  });
});

describe('random meteors', () => {
  const samples = Array.from({ length: 500 }, (_, i) => randomMeteor(seeded(i + 1)));

  it('stay inside the limits of every property', () => {
    samples.forEach((meteor) => {
      expect(within(meteor.x, LIMITS.x)).toBe(true);
      expect(within(meteor.y, LIMITS.y)).toBe(true);
      expect(within(meteor.length, LIMITS.length)).toBe(true);
      expect(within(meteor.thickness, LIMITS.thickness)).toBe(true);
      expect(within(meteor.angleDeg, LIMITS.angleDeg)).toBe(true);
      expect(within(meteor.travelShare, LIMITS.travelShare)).toBe(true);
      expect(within(meteor.flightMs, LIMITS.flightMs)).toBe(true);
      expect(Number.isInteger(meteor.color)).toBe(true);
    });
  });

  it('always fall to the lower left, starting inside the sky', () => {
    samples.forEach((meteor) => {
      expect(travelDirection(meteor.angleDeg).x).toBeLessThan(0);
      expect(travelDirection(meteor.angleDeg).y).toBeGreaterThan(0);
      expect(meteor.y).toBeLessThan(0.5);
    });
  });

  it('really differ from one another in size, colour, angle, speed and starting point', () => {
    const distinct = (values: number[]) => new Set(values.map((v) => v.toFixed(6))).size;

    expect(distinct(samples.map((m) => m.length))).toBeGreaterThan(450);
    expect(distinct(samples.map((m) => m.thickness))).toBeGreaterThan(450);
    expect(distinct(samples.map((m) => m.angleDeg))).toBeGreaterThan(450);
    expect(distinct(samples.map((m) => m.flightMs))).toBeGreaterThan(450);
    expect(distinct(samples.map((m) => m.x))).toBeGreaterThan(450);
    expect(distinct(samples.map((m) => m.y))).toBeGreaterThan(450);
    // Every colour variant of every theme gets used.
    expect(new Set(samples.map((m) => m.color % 4)).size).toBe(4);
    expect(new Set(samples.map((m) => m.color % 5)).size).toBe(5);
  });

  it('cover the whole range, not just one corner of it', () => {
    const spread = (values: number[], [min, max]: readonly [number, number]) => {
      const low = Math.min(...values);
      const high = Math.max(...values);
      return (high - low) / (max - min);
    };

    expect(
      spread(
        samples.map((m) => m.length),
        LIMITS.length,
      ),
    ).toBeGreaterThan(0.9);
    expect(
      spread(
        samples.map((m) => m.x),
        LIMITS.x,
      ),
    ).toBeGreaterThan(0.9);
    expect(
      spread(
        samples.map((m) => m.flightMs),
        LIMITS.flightMs,
      ),
    ).toBeGreaterThan(0.9);
  });
});

describe('rhythm of the shower', () => {
  it('rests a random time inside the limits, scaled by the density', () => {
    const rng = seeded(7);
    const gaps = Array.from({ length: 200 }, () => nextGapMs(1, rng));

    gaps.forEach((gap) => expect(within(gap, LIMITS.gapMs)).toBe(true));
    expect(new Set(gaps.map((g) => Math.round(g))).size).toBeGreaterThan(190);
    expect(nextGapMs(0.5, () => 0.5)).toBeCloseTo(nextGapMs(1, () => 0.5) / 2, 6);
  });

  it('re-rolls the density inside the limits, and it really changes', () => {
    const density = new SkyDensity(seeded(11));
    const seen: { maxActive: number; gapScale: number; keepMs: number }[] = [];

    for (let i = 0; i < 200; i += 1) {
      const keepMs = density.reroll();
      seen.push({ maxActive: density.maxActive, gapScale: density.gapScale, keepMs });
    }

    seen.forEach(({ maxActive, gapScale, keepMs }) => {
      expect(within(maxActive, LIMITS.maxActive)).toBe(true);
      expect(Number.isInteger(maxActive)).toBe(true);
      expect(within(gapScale, LIMITS.gapScale)).toBe(true);
      expect(within(keepMs, LIMITS.densityMs)).toBe(true);
    });
    expect(new Set(seen.map((d) => d.maxActive)).size).toBe(
      LIMITS.maxActive[1] - LIMITS.maxActive[0] + 1,
    );
    expect(new Set(seen.map((d) => d.gapScale.toFixed(6))).size).toBeGreaterThan(190);
  });

  it('never lets more meteors fly than the density allows, whatever the order of events', () => {
    const rng = seeded(23);
    const density = new SkyDensity(rng);
    let mostAtOnce = 0;

    for (let step = 0; step < 20_000; step += 1) {
      const roll = rng();
      if (roll < 0.05) density.reroll();
      else if (roll < 0.55) {
        const before = density.active;
        const launched = density.tryLaunch();
        // A launch only happens when there was room.
        expect(launched).toBe(before < density.maxActive);
      } else density.land();
      mostAtOnce = Math.max(mostAtOnce, density.active);
      expect(density.active).toBeGreaterThanOrEqual(0);
    }

    expect(mostAtOnce).toBeLessThanOrEqual(LIMITS.maxActive[1]);
  });

  it('has more places than the sky will ever let fly, so it can always fill up', () => {
    expect(SLOT_COUNT).toBeGreaterThanOrEqual(LIMITS.maxActive[1]);
    expect(REDUCED_MOTION_COUNT).toBeGreaterThan(0);
  });
});

// WCAG relative luminance and contrast, to check the colours against the sky of each theme.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const THEMES = ['dia', 'posta', 'nit', 'vermell'] as const;

describe('meteor colours per theme', () => {
  it.each(THEMES)('%s has several distinct variants', (name) => {
    const heads = colors[name].meteors.map((variant) => variant.head);

    expect(heads.length).toBeGreaterThanOrEqual(4);
    expect(new Set(heads).size).toBe(heads.length);
  });

  it.each(THEMES)('every head of %s reads (3:1) on its sky', (name) => {
    const { top, low } = colors[name].sky;
    // The meteors cross the upper part of the sky; at dusk the horizon is deliberately left out.
    const backgrounds = name === 'dia' ? [top, low] : [top];

    colors[name].meteors.forEach(({ head }) => {
      backgrounds.forEach((background) => {
        expect(contrast(head, background)).toBeGreaterThanOrEqual(3);
      });
    });
  });

  it('vermell keeps to reds and oranges: no blue or green anywhere', () => {
    colors.vermell.meteors.forEach(({ head, tail }) => {
      [head, tail].forEach((hex) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        expect(r).toBeGreaterThanOrEqual(g);
        expect(r).toBeGreaterThanOrEqual(b);
        expect(r).toBeGreaterThanOrEqual(0xa0);
      });
    });
  });
});
