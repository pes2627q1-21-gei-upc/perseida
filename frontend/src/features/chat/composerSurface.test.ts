import { colors, type ThemeName } from '../../shared/theme';
import { composerSurface } from './composerSurface';

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
/** What the eye sees: a surface (#RRGGBB or #RRGGBBAA) over a background. */
function over(surface: string, background: string) {
  const alpha = surface.length === 9 ? parseInt(surface.slice(7, 9), 16) / 255 : 1;
  const back = rgb(background);
  return rgb(surface).map((channel, i) => channel * alpha + (back[i] ?? 0) * (1 - alpha));
}

const THEMES: ThemeName[] = ['dia', 'posta', 'nit', 'vermell'];

/** Every colour of the scene the composer can float over: the sky and the whole lake. */
function scene(name: ThemeName) {
  const { sky, lake } = colors[name];
  const { flowers, ...rest } = lake;
  return [sky.top, sky.low, ...Object.values(rest), ...flowers];
}

// The panel carries the reason it cannot send (text.secondary), the alerts (state.danger) and the
// counter (both); the field carries what is typed (text.primary) and its placeholder
// (text.secondary). The glass tokens, made for a blurred layer, do not reach 4.5:1 over the light
// parts of the posta lake, so the composer uses the glass of the rows (TG-469, WCAG 1.4.3).
describe('composerSurface (TG-469, WCAG 1.4.3)', () => {
  describe.each(THEMES)('%s', (name) => {
    const { text, state } = colors[name];

    it.each([false, true])(
      'the texts of the panel read at 4.5:1 over any colour of the scene (reduce transparency: %s)',
      (reduceTransparency) => {
        const { panel } = composerSurface(colors[name], reduceTransparency);

        scene(name).forEach((background) => {
          const seen = over(panel, background);
          [text.primary, text.secondary, state.danger].forEach((foreground) => {
            expect(contrast(rgb(foreground), seen)).toBeGreaterThanOrEqual(4.5);
          });
        });
      },
    );

    it('the panel is still glass, translucent, and opaque with «Reduce transparency»', () => {
      const glass = composerSurface(colors[name], false).panel;
      const solid = composerSurface(colors[name], true).panel;

      expect(glass).toMatch(/^#[0-9A-F]{8}$/i);
      expect(parseInt(glass.slice(7, 9), 16)).toBeLessThan(255);
      expect(solid).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('the field is opaque and what is typed and its placeholder read at 4.5:1 on it', () => {
      const { field } = composerSurface(colors[name], false);

      expect(field).toMatch(/^#[0-9A-F]{6}$/i);
      [text.primary, text.secondary].forEach((foreground) => {
        expect(contrast(rgb(foreground), rgb(field))).toBeGreaterThanOrEqual(4.5);
      });
    });
  });
});
