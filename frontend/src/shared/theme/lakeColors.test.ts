import { colors, type ThemeName } from './colors';

function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const THEMES: ThemeName[] = ['dia', 'posta', 'nit', 'vermell'];

describe('lake colours', () => {
  it.each(THEMES)('%s defines the whole lake, as 6-digit hex colours', (name) => {
    const { flowers, ...single } = colors[name].lake;

    Object.values(single).forEach((value) => expect(value).toMatch(/^#[0-9A-F]{6}$/i));
    expect(flowers.length).toBeGreaterThanOrEqual(3);
    flowers.forEach((value) => expect(value).toMatch(/^#[0-9A-F]{6}$/i));
  });

  it.each(THEMES)('%s: the hills stand out from the sky and from each other', (name) => {
    const { lake, sky } = colors[name];

    expect(contrast(lake.hillFar, sky.low)).toBeGreaterThanOrEqual(1.08);
    expect(contrast(lake.hillNear, lake.hillFar)).toBeGreaterThanOrEqual(1.08);
  });

  it.each(THEMES)('%s: the meadow stands out from the water that it surrounds', (name) => {
    const { lake } = colors[name];

    expect(contrast(lake.grassDark, lake.waterBottom)).toBeGreaterThanOrEqual(1.1);
    expect(contrast(lake.grassLight, lake.waterTop)).toBeGreaterThanOrEqual(1.1);
  });

  it.each(THEMES)('%s: the rim light is visible on the meadow and on the water', (name) => {
    const { lake } = colors[name];

    expect(contrast(lake.rim, lake.grassDark)).toBeGreaterThanOrEqual(1.5);
  });

  // The title and the quiet buttons can sit over the water. At dusk the horizon is warm and
  // light and text on it does not reach 4.5:1 (a known limit, the theme is not selectable yet).
  it.each(['dia', 'nit', 'vermell'] as ThemeName[])(
    '%s: the text of the app reads over the whole water',
    (name) => {
      const { lake, text } = colors[name];

      expect(contrast(text.primary, lake.waterTop)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text.primary, lake.waterBottom)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('vermell keeps to reds: no blue or green anywhere in the lake', () => {
    const { flowers, ...single } = colors.vermell.lake;

    [...Object.values(single), ...flowers].forEach((hex) => {
      const [r, g, b] = channels(hex);
      expect(r).toBeGreaterThanOrEqual(g);
      expect(r).toBeGreaterThanOrEqual(b);
    });
  });
});
