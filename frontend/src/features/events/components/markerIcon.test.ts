import type { ReactElement } from 'react';

import { colors, duration } from '../../../shared/theme';
import {
  CATEGORY_ICON,
  MARKER_SIZE,
  markerCss,
  markerIconHtml,
  markerPalette,
  OUTING_ICON,
} from './markerIcon';

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

  // TG-646 criterion 1: the outings have their own icon, next to the categories.
  it('draws the outings with the regular Phosphor Binoculars', () => {
    expect(OUTING_ICON.name).toBe('Binoculars');
    expect(OUTING_ICON.path).toBe(phosphorRegularPath('Binoculars'));
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
      brand: colors.dia.brand,
    });
  });
});

describe('markerIconHtml', () => {
  it('draws the category icon inside a glass orb, hidden from screen readers', () => {
    const html = markerIconHtml({ kind: 'event', category: 'launch', active: false });

    expect(html).toContain('class="pm-orb"');
    expect(html).toContain(`d="${CATEGORY_ICON.launch.path}"`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('pm-halo');
  });

  it('adds the halo only to active events', () => {
    expect(markerIconHtml({ kind: 'event', category: 'lunar', active: true })).toContain(
      'class="pm-halo"',
    );
  });

  it('draws the outings with the binoculars and the pm-outing class, not with a category icon (TG-646)', () => {
    const html = markerIconHtml({ kind: 'outing', category: 'lunar', active: false });

    expect(html).toContain(`d="${OUTING_ICON.path}"`);
    expect(html).not.toContain(CATEGORY_ICON.lunar.path);
    expect(html).toMatch(/class="pm-orb pm-outing"|class="pm-outing pm-orb"/);
    expect(html).toContain('aria-hidden="true"');
  });

  it('does not give the events the pm-outing class (TG-646)', () => {
    expect(markerIconHtml({ kind: 'event', category: 'lunar', active: false })).not.toContain(
      'pm-outing',
    );
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

  // Regression (PR #89 review): Leaflet's `.leaflet-touch .leaflet-bar a` (0,2,1) and
  // `.leaflet-touch .leaflet-control-zoom-in` (0,2,0) beat a plain `.leaflet-control-zoom a`.
  it('gives the Leaflet zoom buttons the touch target of 48 px, over the Leaflet styles', () => {
    const css = markerCss(PALETTE, { reduceMotion: false });

    expect(css).toContain(
      `.leaflet-container .leaflet-control-zoom.leaflet-bar a { width: ${MARKER_SIZE}px; height: ${MARKER_SIZE}px; line-height: ${MARKER_SIZE}px;`,
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

  it('gives the outings a rim and a glow of the brand colour (TG-646 criterion 1)', () => {
    const css = markerCss(PALETTE, { reduceMotion: false });
    const rule = css.match(/\.pm-outing\s*\{([^}]*)\}/);

    expect(rule).not.toBeNull();
    expect(rule![1]).toContain(`border-color: ${PALETTE.brand}`);
    expect(rule![1]).toContain(`box-shadow: 0 0 14px ${PALETTE.brand}`);
  });

  it('freezes the halo when the app asks for reduced motion', () => {
    const css = markerCss(PALETTE, { reduceMotion: true });

    expect(css).not.toContain('pm-pulse');
    expect(css).toContain('.pm-halo');
  });
});

// TG-646 criterion 1: the rim of an outing against the map, 3:1 for non-text (WCAG 1.4.11).
// Same relative-luminance formula as contrast.py of the estetica skill (and lakeColors.test).
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe('outing marker rim contrast', () => {
  it.each(['dia', 'posta', 'nit', 'vermell'] as const)(
    '%s: the brand rim stands out from the map by 3:1 or more',
    (name) => {
      const palette = markerPalette(colors[name]);

      expect(contrast(palette.brand, palette.background)).toBeGreaterThanOrEqual(3);
    },
  );
});
