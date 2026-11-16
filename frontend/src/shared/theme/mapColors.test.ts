import { colors, type ThemeName } from './colors';

const THEMES: ThemeName[] = ['dia', 'posta', 'nit', 'vermell'];

describe('map colours', () => {
  it.each(THEMES)('%s defines the background behind the map tiles as a 6-digit hex', (name) => {
    expect(colors[name].map.background).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it.each(THEMES)('%s defines the gloss of the orbs: 30 % white fading out', (name) => {
    expect(colors[name].map.gloss).toEqual(['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']);
  });

  it('vermell has no blue in the map background', () => {
    const hex = colors.vermell.map.background;
    const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

    expect(b).toBeLessThanOrEqual(r);
  });
});
