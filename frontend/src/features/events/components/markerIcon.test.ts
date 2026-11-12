import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { colors, duration } from '../../../shared/theme';
import { CATEGORY_ICON, MARKER_SIZE, markerCss, markerIconHtml, markerPalette } from './markerIcon';

/** `d` of the regular weight of a Phosphor icon, read from the installed package. */
function phosphorRegularPath(name: string): string {
  const file = join(
    __dirname,
    '../../../../node_modules/phosphor-react-native/src/defs',
    `${name}.tsx`,
  );
  const regular = readFileSync(file, 'utf8').split("'regular',")[1];
  return /d="([^"]+)"/.exec(regular)![1];
}

const PALETTE = markerPalette(colors.nit);

describe('CATEGORY_ICON', () => {
  it.each([
    ['lunar', 'Moon'],
    ['solar', 'Sun'],
    ['meteor_shower', 'ShootingStar'],
    ['launch', 'RocketLaunch'],
  ] as const)('draws %s with the regular Phosphor %s', (category, name) => {
    expect(CATEGORY_ICON[category].name).toBe(name);
    expect(CATEGORY_ICON[category].path).toBe(phosphorRegularPath(name));
  });
});

describe('markerPalette', () => {
  it('takes the orb colours from the theme tokens', () => {
    expect(markerPalette(colors.dia)).toEqual({
      orb: colors.dia.surface.glassSolid,
      rim: colors.dia.accentGlow,
      icon: colors.dia.text.primary,
      glow: colors.dia.accentGlow,
    });
  });
});

describe('markerIconHtml', () => {
  it('draws the category icon inside a glass orb, hidden from screen readers', () => {
    const html = markerIconHtml({ category: 'launch', active: false });

    expect(html).toContain('class="pm-orb"');
    expect(html).toContain(`d="${CATEGORY_ICON.launch.path}"`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('pm-halo');
  });

  it('adds the halo only to active events', () => {
    expect(markerIconHtml({ category: 'lunar', active: true })).toContain('class="pm-halo"');
  });
});

describe('markerCss', () => {
  it('styles the orb with the palette and a touch target of 48 px', () => {
    const css = markerCss(PALETTE, { reduceMotion: false });

    expect(MARKER_SIZE).toBe(48);
    expect(css).toContain(PALETTE.orb);
    expect(css).toContain(PALETTE.rim);
    expect(css).toContain(PALETTE.icon);
    expect(css).toContain(`${MARKER_SIZE}px`);
  });

  it('pulses the halo once every ambient cycle, and never with reduced motion', () => {
    const css = markerCss(PALETTE, { reduceMotion: false });

    expect(duration.ambient).toBe(6000);
    expect(css).toContain(`pm-pulse ${duration.ambient}ms`);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.pm-halo\s*\{\s*animation: none/,
    );
  });

  it('freezes the halo when the app asks for reduced motion', () => {
    const css = markerCss(PALETTE, { reduceMotion: true });

    expect(css).not.toContain('pm-pulse');
    expect(css).toContain('.pm-halo');
  });
});
