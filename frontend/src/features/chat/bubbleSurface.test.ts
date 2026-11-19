import { colors, type ThemeName } from '../../shared/theme';
import { bubbleSurface } from './bubbleSurface';

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
function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
/** What the eye sees: the bubble surface (#RRGGBB or #RRGGBBAA) over a background. */
function over(surface: string, background: string) {
  const alpha = surface.length === 9 ? parseInt(surface.slice(7, 9), 16) / 255 : 1;
  const back = rgb(background);
  return rgb(surface).map((channel, i) => channel * alpha + (back[i] ?? 0) * (1 - alpha));
}

const THEMES: ThemeName[] = ['dia', 'posta', 'nit', 'vermell'];
const SIDES = [
  ['mine', true],
  ['others', false],
] as const;

/** Every colour of the scene a bubble can sit on: the sky and the whole lake, glitter included. */
function scene(name: ThemeName) {
  const { sky, lake } = colors[name];
  const { flowers, ...rest } = lake;
  return [sky.top, sky.low, ...Object.values(rest), ...flowers];
}

// The signature is `bubbleSurface(themeColors, mine, reduceTransparency)`, like `rowSurface`.
describe('bubbleSurface (TG-469, WCAG 1.4.3)', () => {
  describe.each(THEMES)('%s', (name) => {
    it.each(SIDES)(
      'text reads at 4.5:1 on the bubble of %s over any colour of the scene',
      (_side, mine) => {
        const { text } = colors[name];

        scene(name).forEach((background) => {
          const seen = over(bubbleSurface(colors[name], mine, false), background);
          expect(contrast(rgb(text.primary), seen)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(rgb(text.secondary), seen)).toBeGreaterThanOrEqual(4.5);
        });
      },
    );

    it.each(SIDES)('the bubble of %s is opaque with «Reduce transparency»', (_side, mine) => {
      const { text } = colors[name];
      const surface = bubbleSurface(colors[name], mine, true);

      expect(surface).toMatch(/^#[0-9A-F]{6}$/i);
      expect(contrast(rgb(text.primary), rgb(surface))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(text.secondary), rgb(surface))).toBeGreaterThanOrEqual(4.5);
    });

    it('mine and others look different, with and without transparency', () => {
      expect(bubbleSurface(colors[name], true, false)).not.toBe(
        bubbleSurface(colors[name], false, false),
      );
      expect(bubbleSurface(colors[name], true, true)).not.toBe(
        bubbleSurface(colors[name], false, true),
      );
    });

    it('is a hex colour, with or without alpha, and the translucent one is not a slab', () => {
      [true, false].forEach((mine) => {
        const surface = bubbleSurface(colors[name], mine, false);

        expect(surface).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/i);
        if (surface.length === 9) expect(parseInt(surface.slice(7, 9), 16)).toBeLessThan(255);
      });
    });
  });
});
