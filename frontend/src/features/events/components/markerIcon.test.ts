import type { ReactElement } from 'react';

import { colors, duration } from '../../../shared/theme';
import { CATEGORY_ICON, MARKER_SIZE, markerCss, markerIconHtml, markerPalette } from './markerIcon';

type Weights = Map<string, ReactElement<{ children: ReactElement<{ d: string }> }>>;

// The package's `exports` hide its icon definitions, so they are read from node_modules.
const PHOSPHOR_DEFS = '../../../../node_modules/phosphor-react-native/lib/commonjs/defs';

/** `d` of the regular weight of a Phosphor icon, read from the installed package. */
function phosphorRegularPath(name: string): string {
  const defs: Weights = jest.requireActual(`${PHOSPHOR_DEFS}/${name}`).default;
  return defs.get('regular')!.props.children.props.d;
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
      background: colors.dia.map.background,
      gloss: colors.dia.map.gloss,
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
    expect(css).toContain(`linear-gradient(${PALETTE.gloss[0]}, ${PALETTE.gloss[1]})`);
  });

  it('gives the Leaflet zoom buttons the touch target of 48 px', () => {
    const css = markerCss(PALETTE, { reduceMotion: false });

    expect(css).toContain(
      `.leaflet-control-zoom a { width: ${MARKER_SIZE}px; height: ${MARKER_SIZE}px; line-height: ${MARKER_SIZE}px;`,
    );
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
