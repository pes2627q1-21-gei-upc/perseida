import { colors, type ThemeName } from '../../shared/theme';
import { rowSurface } from './rowSurface';

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
/** What the eye sees: the row surface (#RRGGBB or #RRGGBBAA) over a background. */
function over(surface: string, background: string) {
  const alpha = surface.length === 9 ? parseInt(surface.slice(7, 9), 16) / 255 : 1;
  const back = rgb(background);
  return rgb(surface).map((channel, i) => channel * alpha + (back[i] ?? 0) * (1 - alpha));
}

const THEMES: ThemeName[] = ['dia', 'posta', 'nit', 'vermell'];

/** Every colour of the scene a row can sit on: the sky and the whole lake, glitter included. */
function scene(name: ThemeName) {
  const { sky, lake } = colors[name];
  const { flowers, ...rest } = lake;
  return [sky.top, sky.low, ...Object.values(rest), ...flowers];
}

describe('rowSurface (TG-469, WCAG 1.4.3)', () => {
  it.each(THEMES)('%s: text reads at 4.5:1 on the row over any colour of the scene', (name) => {
    const { surface, text } = colors[name];

    scene(name).forEach((background) => {
      const seen = over(rowSurface(surface, false), background);
      expect(contrast(rgb(text.primary), seen)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(text.secondary), seen)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it.each(THEMES)('%s: the row is still translucent, it is glass and not a slab', (name) => {
    const row = rowSurface(colors[name].surface, false);

    expect(row).toMatch(/^#[0-9A-F]{6}[0-9A-F]{2}$/i);
    expect(parseInt(row.slice(7, 9), 16)).toBeLessThan(255);
  });

  it.each(THEMES)('%s: with «Reduce transparency» the row is the solid glass colour', (name) => {
    const { surface } = colors[name];

    expect(rowSurface(surface, true)).toBe(surface.glassSolid);
  });
});
