import { colors, type ThemeName } from './colors';

function luminance([r, g, b]: number[]) {
  const [lr, lg, lb] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
function contrast(a: number[], b: number[]) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
function hex(value: string) {
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
}
function rgba(value: string) {
  const [r, g, b, alpha] = value.match(/[\d.]+/g)!.map(Number);
  return { rgb: [r, g, b], alpha };
}
function toHex(channel: number) {
  return Math.round(channel).toString(16).padStart(2, '0');
}
/** What the eye sees through the glass: the glass colour blended over the background. */
function throughGlass(glass: string, background: string) {
  const { rgb, alpha } = rgba(glass);
  return hex(background).map((channel, i) => rgb[i] * alpha + channel * (1 - alpha));
}

const DARK_THEMES: ThemeName[] = ['posta', 'nit', 'vermell'];

// TG-650: the light parts of the scene (the moon, the light labels of the dark map tiles) can sit
// behind a panel. The text has to read on the worst of them, not only on the sky.
const WORST_BACKGROUNDS: Record<'nit' | 'vermell', string[]> = {
  nit: [colors.nit.sky.top, colors.nit.sky.low, colors.nit.lake.glow, '#FFFFFF'],
  vermell: [colors.vermell.sky.top, colors.vermell.sky.low, colors.vermell.lake.glow],
};

describe('glass colours', () => {
  it.each(DARK_THEMES)('%s: the glass behind text is at least 60 % opaque (tokens.md)', (name) => {
    expect(rgba(colors[name].surface.glass).alpha).toBeGreaterThanOrEqual(0.6);
  });

  it.each(['nit', 'vermell'] as const)(
    '%s: text and brand read at 4.5:1 through the glass over the worst background',
    (name) => {
      const { surface, text, brand } = colors[name];

      WORST_BACKGROUNDS[name].forEach((background) => {
        const seen = throughGlass(surface.glass, background);
        expect(contrast(hex(text.primary), seen)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(hex(text.secondary), seen)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(hex(brand), seen)).toBeGreaterThanOrEqual(4.5);
      });
    },
  );

  // A pressed button, a field or a chip sits on a glass panel: on the dark glass it needs its own
  // light layer to be seen (1.1:1, as the lake layers that stand out), and the text still reads.
  it.each(['nit', 'vermell'] as const)(
    '%s: the layer on top of the glass stands out from the panel and keeps the text readable',
    (name) => {
      const { surface, text } = colors[name];

      WORST_BACKGROUNDS[name].forEach((background) => {
        const panel = throughGlass(surface.glass, background);
        const layer = throughGlass(surface.onGlass, `#${panel.map(toHex).join('')}`);
        expect(contrast(layer, panel)).toBeGreaterThanOrEqual(1.1);
        expect(contrast(hex(text.primary), layer)).toBeGreaterThanOrEqual(4.5);
      });
    },
  );

  it.each(['dia', 'posta'] as const)(
    '%s: the layer on top of the glass keeps the look it had (the glass itself)',
    (name) => {
      expect(colors[name].surface.onGlass).toBe(colors[name].surface.glass);
    },
  );

  it('vermell glass has no blue or green', () => {
    const [r, g, b] = rgba(colors.vermell.surface.glass).rgb;

    expect(r).toBeGreaterThanOrEqual(g);
    expect(r).toBeGreaterThanOrEqual(b);
  });
});
