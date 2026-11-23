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

/** Every colour of the scene a bubble can sit on: the sky and the whole lake, glitter included. */
function scene(name: ThemeName) {
  const { sky, lake } = colors[name];
  const { flowers, ...rest } = lake;
  return [sky.top, sky.low, ...Object.values(rest), ...flowers];
}

// Signature: bubbleSurface(themeColors, mine, reduceTransparency) returns
// { background, tint?, text, secondaryText, border }. Mine is glass tinted with the accent (the
// glass of the others plus a veil of the accent colour); the gel is only for actions.
describe('bubbleSurface (TG-469, WCAG 1.4.3)', () => {
  describe.each(THEMES)('%s', (name) => {
    const { accentGlow, text } = colors[name];

    it('my bubble is tinted glass: the glass of the others plus a veil of the accent, no gel', () => {
      const mine = bubbleSurface(colors[name], true, false);
      const others = bubbleSurface(colors[name], false, false);

      expect(mine.background).toBe(others.background);
      expect(mine.tint).toMatch(new RegExp(`^${accentGlow}[0-9A-F]{2}$`, 'i'));
      expect(parseInt((mine.tint ?? '').slice(7, 9), 16)).toBeLessThan(255);
      expect(mine.border).toBe(accentGlow);
      expect(mine).not.toHaveProperty('gradient');
      expect(mine.text).toBe(text.primary);
      expect(mine.secondaryText).toBe(text.secondary);
    });

    it.each([false, true])(
      'my text reads at 4.5:1 over the whole scene, the veil included (transparency off: %s)',
      (reduceTransparency) => {
        const mine = bubbleSurface(colors[name], true, reduceTransparency);

        scene(name).forEach((backgroundColor) => {
          const glass = over(mine.background, backgroundColor);
          const seen = over(
            mine.tint ?? '',
            `#${glass.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`,
          );
          expect(contrast(rgb(mine.text), seen)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(rgb(mine.secondaryText), seen)).toBeGreaterThanOrEqual(4.5);
        });
      },
    );

    it('my bubble is opaque with «Reduce transparency»', () => {
      expect(bubbleSurface(colors[name], true, true).background).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('the bubble of others reads at 4.5:1 over any colour of the scene', () => {
      const others = bubbleSurface(colors[name], false, false);

      expect(others.text).toBe(text.primary);
      expect(others.secondaryText).toBe(text.secondary);
      scene(name).forEach((backgroundColor) => {
        const seen = over(others.background, backgroundColor);
        expect(contrast(rgb(others.text), seen)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(rgb(others.secondaryText), seen)).toBeGreaterThanOrEqual(4.5);
      });
    });

    it('the bubble of others is still glass, translucent, with no veil', () => {
      const others = bubbleSurface(colors[name], false, false);

      expect(others.background).toMatch(/^#[0-9A-F]{6}[0-9A-F]{2}$/i);
      expect(parseInt(others.background.slice(7, 9), 16)).toBeLessThan(255);
      expect(others.tint).toBeUndefined();
    });

    it('the bubble of others is opaque with «Reduce transparency»', () => {
      const others = bubbleSurface(colors[name], false, true);

      expect(others.background).toMatch(/^#[0-9A-F]{6}$/i);
      expect(contrast(rgb(others.text), rgb(others.background))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(others.secondaryText), rgb(others.background))).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it.each([false, true])('mine and others look different (reduce transparency: %s)', (reduce) => {
      const mine = bubbleSurface(colors[name], true, reduce);
      const others = bubbleSurface(colors[name], false, reduce);

      expect(mine.tint).toBeDefined();
      expect(mine.border).not.toBe(others.border);
    });
  });
});
