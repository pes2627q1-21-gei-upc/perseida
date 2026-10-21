import {
  BANKS_HEIGHT,
  BANKS_WIDTH,
  blades,
  bubbles,
  flowers,
  glints,
  isWater,
  leftShoreX,
  lilyPads,
  reeds,
  rightShoreX,
  seeded,
  shoreline,
  tufts,
  waves,
} from './lakeLayout';

describe('lake layout is deterministic', () => {
  it.each([
    ['waves', () => waves()],
    ['glints', () => glints()],
    ['bubbles', () => bubbles()],
    ['blades', () => blades()],
    ['flowers', () => flowers()],
    ['reeds', () => reeds()],
    ['tufts', () => tufts()],
    ['lily pads', () => lilyPads()],
  ])('%s are the same on every call', (_name, make) => {
    expect(make()).toEqual(make());
  });

  it('seeded numbers stay in [0, 1) and differ with the seed', () => {
    const a = seeded(1);
    const b = seeded(2);
    const first = Array.from({ length: 50 }, a);

    first.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
    expect(first).not.toEqual(Array.from({ length: 50 }, b));
  });
});

describe('the shape of the lake', () => {
  it('is water in the middle and meadow on the sides and in the foreground', () => {
    expect(isWater(200, 90)).toBe(true);
    expect(isWater(200, 150)).toBe(true);
    expect(isWater(1, 100)).toBe(false);
    expect(isWater(BANKS_WIDTH - 1, 100)).toBe(false);
    expect(isWater(10, 30)).toBe(false);
    expect(isWater(200, BANKS_HEIGHT - 4)).toBe(false);
    expect(isWater(20, 190)).toBe(false);
  });

  it('is an oval: widest in the middle, closing in at the far and at the near shore', () => {
    const widthAt = (y: number) => rightShoreX(y) - leftShoreX(y);

    expect(widthAt(70)).toBeGreaterThan(widthAt(20));
    expect(widthAt(70)).toBeGreaterThan(widthAt(160));
    expect(widthAt(70)).toBeGreaterThan(BANKS_WIDTH * 0.85);
    expect(widthAt(20)).toBeGreaterThan(BANKS_WIDTH * 0.3);
  });

  it('has a far bank above the water, so the lake is a closed oval', () => {
    expect(isWater(200, 4)).toBe(false);
    expect(isWater(200, 20)).toBe(true);
    expect(isWater(200, 180)).toBe(true);
    expect(isWater(200, 196)).toBe(false);
  });

  it('has a shoreline that is one closed loop around the water', () => {
    const line = shoreline();

    expect(line.length).toBeGreaterThan(100);
    // Closed: the last point is next to the first.
    const first = line[0];
    const last = line[line.length - 1];
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(16);
    // No gaps: neighbouring points are close.
    line.slice(1).forEach((point, i) => {
      expect(Math.hypot(point.x - line[i].x, point.y - line[i].y)).toBeLessThan(16);
    });
    // And it really is the edge: a little inside is water, a little outside is meadow.
    const centre = { x: BANKS_WIDTH / 2, y: 98 };
    line.forEach((point, index) => {
      if (index % 5 !== 0) return;
      const length = Math.hypot(point.x - centre.x, point.y - centre.y);
      const toward = (distance: number) => ({
        x: point.x + ((centre.x - point.x) / length) * distance,
        y: point.y + ((centre.y - point.y) / length) * distance,
      });
      expect(isWater(toward(9).x, toward(9).y)).toBe(true);
      expect(isWater(toward(-9).x, toward(-9).y)).toBe(false);
    });
  });
});

describe('what lives in the lake stays where it belongs', () => {
  it('bubbles rise through the water, never over the banks', () => {
    bubbles().forEach((bubble) => {
      const x = bubble.x * BANKS_WIDTH;
      // From just above the near shore up to the top of their rise.
      [BANKS_HEIGHT * 0.8, BANKS_HEIGHT * (0.8 - bubble.rise)].forEach((y) => {
        expect(isWater(x, y)).toBe(true);
      });
    });
  });

  it('flowers and blades are on the meadow or on its edge, never out in the water', () => {
    const all = flowers();

    expect(all.length).toBeGreaterThanOrEqual(15);
    all.forEach((flower) => {
      expect(isWater(flower.x * BANKS_WIDTH, flower.y * BANKS_HEIGHT)).toBe(false);
    });
    blades().forEach((blade) => {
      expect(blade.x).toBeGreaterThan(-5);
      expect(blade.x).toBeLessThan(BANKS_WIDTH + 5);
      expect(blade.y).toBeGreaterThanOrEqual(0);
      expect(blade.y).toBeLessThanOrEqual(BANKS_HEIGHT);
    });
  });

  it('reeds stand at the edge of the water, on both sides', () => {
    const all = reeds();

    expect(all.filter((reed) => reed.x < BANKS_WIDTH / 2).length).toBeGreaterThanOrEqual(3);
    expect(all.filter((reed) => reed.x > BANKS_WIDTH / 2).length).toBeGreaterThanOrEqual(3);
    all.forEach((reed) => {
      // Their foot is on the shore line of its side.
      const shore = reed.x < BANKS_WIDTH / 2 ? leftShoreX(reed.y) : rightShoreX(reed.y);
      expect(Math.abs(reed.x - shore)).toBeLessThanOrEqual(3);
    });
  });

  it('tall grass is in the foreground corners, not in the middle of the lake', () => {
    tufts().forEach((tuft) => {
      expect(tuft.x < 0.3 || tuft.x > 0.7).toBe(true);
    });
  });
});

describe('lily pads', () => {
  it('float well inside the water, apart from one another, some of them in bloom', () => {
    const pads = lilyPads();

    expect(pads.length).toBeGreaterThanOrEqual(4);
    pads.forEach((pad) => expect(isWater(pad.x * BANKS_WIDTH, pad.y * BANKS_HEIGHT)).toBe(true));
    expect(pads.some((pad) => pad.flower)).toBe(true);
    expect(pads.some((pad) => !pad.flower)).toBe(true);
    pads.forEach((a, i) =>
      pads.slice(i + 1).forEach((b) => {
        expect(Math.hypot((a.x - b.x) * BANKS_WIDTH, (a.y - b.y) * BANKS_HEIGHT)).toBeGreaterThan(
          40,
        );
      }),
    );
  });

  it('keep away from the column of light on the right', () => {
    lilyPads().forEach((pad) => expect(pad.x).toBeLessThan(0.66));
  });
});

describe('the water moves in a believable way', () => {
  it('has fine wavelets near the far shore and bolder ones near the viewer', () => {
    const all = waves().sort((a, b) => a.depth - b.depth);

    expect(all[0].height).toBeLessThan(all[all.length - 1].height);
    expect(all[0].width).toBeLessThan(all[all.length - 1].width);
    all.forEach((wave) => {
      expect(wave.depth).toBeGreaterThan(0);
      expect(wave.depth).toBeLessThan(1);
      expect(wave.opacity).toBeGreaterThan(0);
      expect(wave.opacity).toBeLessThan(0.5);
    });
  });

  it('glitter forms a column that widens towards the viewer', () => {
    const all = glints();
    const nearest = all.slice(-4);
    const farthest = all.slice(0, 4);
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

    expect(mean(nearest.map((g) => g.width))).toBeGreaterThan(mean(farthest.map((g) => g.width)));
    all.forEach((glint) => {
      expect(glint.periodMs).toBeGreaterThan(1000);
    });
  });
});
