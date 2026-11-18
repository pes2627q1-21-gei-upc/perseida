import { colors, type ThemeName } from './colors';

const THEMES: ThemeName[] = ['dia', 'posta', 'nit', 'vermell'];

function parse(rgba: string) {
  const match = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(rgba);
  if (!match) throw new Error(`not an rgba colour: ${rgba}`);
  const [r, g, b] = match.slice(1, 4).map(Number);
  return { r, g, b, alpha: Number(match[4]) };
}

// The veil behind a dialog darkens the screen on every theme, also the dark ones (the text
// of a dialog is on its glass panel, not on the veil).
describe('scrim colours', () => {
  it.each(THEMES)('%s has a dark, translucent veil', (name) => {
    const { r, g, b, alpha } = parse(colors[name].surface.scrim);

    expect(Math.max(r, g, b)).toBeLessThanOrEqual(40);
    expect(alpha).toBeGreaterThanOrEqual(0.45);
    expect(alpha).toBeLessThanOrEqual(0.7);
  });

  it('vermell has no blue in the veil', () => {
    const { r, b } = parse(colors.vermell.surface.scrim);

    expect(b).toBeLessThanOrEqual(r);
  });
});
