import { duration, iconSizes, type ThemeColors, touch } from '../../../shared/theme';
import type { EventCategory } from '../api/getEvents';
import type { MapMarker } from './mapTiles';

/**
 * Phosphor icons (regular weight) of each category, as SVG paths on a 256 grid. Leaflet draws
 * the markers as HTML, where the React Native components cannot go, so the paths are copied
 * from `phosphor-react-native` 3.0.6 (MIT); a test checks they still match the package.
 */
export const CATEGORY_ICON: Record<EventCategory, { name: string; path: string }> = {
  lunar: {
    name: 'Moon',
    path: 'M233.54 142.23a8 8 0 0 0-8-2 88.08 88.08 0 0 1-109.8-109.8 8 8 0 0 0-10-10 104.84 104.84 0 0 0-52.91 37A104 104 0 0 0 136 224a103.1 103.1 0 0 0 62.52-20.88 104.84 104.84 0 0 0 37-52.91 8 8 0 0 0-1.98-7.98m-44.64 48.11A88 88 0 0 1 65.66 67.11a89 89 0 0 1 31.4-26A106 106 0 0 0 96 56a104.11 104.11 0 0 0 104 104 106 106 0 0 0 14.92-1.06 89 89 0 0 1-26.02 31.4',
  },
  solar: {
    name: 'Sun',
    path: 'M120 40V16a8 8 0 0 1 16 0v24a8 8 0 0 1-16 0m72 88a64 64 0 1 1-64-64 64.07 64.07 0 0 1 64 64m-16 0a48 48 0 1 0-48 48 48.05 48.05 0 0 0 48-48M58.34 69.66a8 8 0 0 0 11.32-11.32l-16-16a8 8 0 0 0-11.32 11.32Zm0 116.68-16 16a8 8 0 0 0 11.32 11.32l16-16a8 8 0 0 0-11.32-11.32M192 72a8 8 0 0 0 5.66-2.34l16-16a8 8 0 0 0-11.32-11.32l-16 16A8 8 0 0 0 192 72m5.66 114.34a8 8 0 0 0-11.32 11.32l16 16a8 8 0 0 0 11.32-11.32ZM48 128a8 8 0 0 0-8-8H16a8 8 0 0 0 0 16h24a8 8 0 0 0 8-8m80 80a8 8 0 0 0-8 8v24a8 8 0 0 0 16 0v-24a8 8 0 0 0-8-8m112-88h-24a8 8 0 0 0 0 16h24a8 8 0 0 0 0-16',
  },
  meteor_shower: {
    name: 'ShootingStar',
    path: 'M239.35 70.08a13.41 13.41 0 0 0-11.77-9.28l-36.94-2.92-14.21-33.66a13.51 13.51 0 0 0-24.86 0l-14.21 33.66-36.94 2.92a13.39 13.39 0 0 0-7.66 23.58l28.06 23.68-8.56 35.39a13.32 13.32 0 0 0 5.1 13.91 13.51 13.51 0 0 0 15 .69L164 139l31.65 19.06a13.54 13.54 0 0 0 15-.69 13.34 13.34 0 0 0 5.09-13.91l-8.56-35.39 28.06-23.68a13.32 13.32 0 0 0 4.11-14.31M193.08 99a8 8 0 0 0-2.61 8l8.28 34.21-30.62-18.41a8 8 0 0 0-8.25 0l-30.62 18.43 8.28-34.23a8 8 0 0 0-2.62-8L108 76.26l35.52-2.81a8 8 0 0 0 6.74-4.87L164 35.91l13.79 32.67a8 8 0 0 0 6.74 4.87l35.53 2.81Zm-105 24.18-58.42 58.48a8 8 0 0 1-11.32-11.32l58.45-58.45a8 8 0 0 1 11.32 11.32Zm10.81 49.87a8 8 0 0 1 0 11.31l-53.23 53.3a8 8 0 0 1-11.32-11.32l53.27-53.26a8 8 0 0 1 11.31 0Zm73-1a8 8 0 0 1 0 11.32l-54.28 54.28a8 8 0 0 1-11.32-11.32l54.29-54.28a8 8 0 0 1 11.36.01Z',
  },
  launch: {
    name: 'RocketLaunch',
    path: 'M223.85 47.12a16 16 0 0 0-15-15c-12.58-.75-44.73.4-71.41 27.07L132.69 64H74.36A15.9 15.9 0 0 0 63 68.68L28.7 103a16 16 0 0 0 9.07 27.16l38.47 5.37 44.21 44.21 5.37 38.49a15.94 15.94 0 0 0 10.78 12.92 16.1 16.1 0 0 0 5.1.83 15.9 15.9 0 0 0 11.3-4.68l34.32-34.3a15.9 15.9 0 0 0 4.68-11.36v-58.33l4.77-4.77c26.68-26.68 27.83-58.83 27.08-71.42M74.36 80h42.33l-39.53 39.52L40 114.34Zm74.41-9.45a76.65 76.65 0 0 1 59.11-22.47 76.46 76.46 0 0 1-22.42 59.16L128 164.68 91.32 128ZM176 181.64 141.67 216l-5.19-37.17L176 139.31Zm-74.16 9.5C97.34 201 82.29 224 40 224a8 8 0 0 1-8-8c0-42.29 23-57.34 32.86-61.85a8 8 0 0 1 6.64 14.56c-6.43 2.93-20.62 12.36-23.12 38.91 26.55-2.5 36-16.69 38.91-23.12a8 8 0 1 1 14.56 6.64Z',
  },
};

/** The orb is the whole touch target. */
export const MARKER_SIZE = touch.min;

export interface MarkerPalette {
  /** Body of the orb: the opaque glass of the theme (a map has no blur behind it). */
  orb: string;
  /** Rim of light that separates the orb from the dark map (≥3:1 on every theme). */
  rim: string;
  /** Icon: the primary text colour, ≥3.6:1 even under the gloss. */
  icon: string;
  /** Glow and halo. */
  glow: string;
  /** Page behind the map tiles. */
  background: string;
  /** Gloss on the top of the orb. */
  gloss: [string, string];
}

export function markerPalette(colors: ThemeColors): MarkerPalette {
  return {
    orb: colors.surface.glassSolid,
    rim: colors.accentGlow,
    icon: colors.text.primary,
    glow: colors.accentGlow,
    background: colors.map.background,
    gloss: colors.map.gloss,
  };
}

/** Inside of a marker: the orb with its icon, plus the halo if the event is happening now. */
export function markerIconHtml({ category, active }: Pick<MapMarker, 'category' | 'active'>) {
  const halo = active ? '<span class="pm-halo"></span>' : '';
  const icon =
    `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false">` +
    `<path d="${CATEGORY_ICON[category].path}"/></svg>`;
  return `${halo}<span class="pm-orb">${icon}</span>`;
}

/**
 * Styles of the markers. The gloss covers the top 44 % at 30 % white at most, which keeps the
 * icon at ≥3:1 (measured with contrast.py on the four themes). The halo is the only ambient
 * motion of the screen: one slow cycle, never with reduced motion. The Leaflet zoom buttons get
 * the same 48 px touch target as the orbs.
 */
export function markerCss(palette: MarkerPalette, { reduceMotion }: { reduceMotion: boolean }) {
  const orb = MARKER_SIZE - 8;
  // Frozen in a pleasant position: a still ring of light at half opacity.
  const pulse = reduceMotion
    ? 'opacity: 0.5;'
    : `animation: pm-pulse ${duration.ambient}ms cubic-bezier(0.23, 1, 0.32, 1) infinite;`;
  const keyframes = reduceMotion
    ? ''
    : '\n@keyframes pm-pulse { 0% { transform: scale(1); opacity: 0.8; } 60% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(1.6); opacity: 0; } }';
  return `.pm-marker { width: ${MARKER_SIZE}px; height: ${MARKER_SIZE}px; display: flex; align-items: center; justify-content: center; }
.pm-marker:focus-visible { outline: 3px solid ${palette.rim}; outline-offset: 2px; border-radius: 50%; }
.pm-orb { position: relative; width: ${orb}px; height: ${orb}px; border-radius: 50%; box-sizing: border-box; background: ${palette.orb}; border: 2px solid ${palette.rim}; box-shadow: 0 0 14px ${palette.glow}99; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.pm-orb::before { content: ''; position: absolute; top: 0; left: 8%; right: 8%; height: 44%; border-radius: 0 0 50% 50%; background: linear-gradient(${palette.gloss[0]}, ${palette.gloss[1]}); pointer-events: none; }
.pm-orb svg { width: ${iconSizes.md}px; height: ${iconSizes.md}px; fill: ${palette.icon}; }
.pm-halo { position: absolute; width: ${orb}px; height: ${orb}px; border-radius: 50%; border: 2px solid ${palette.glow}; box-sizing: border-box; pointer-events: none; ${pulse} }${keyframes}
@media (prefers-reduced-motion: reduce) { .pm-halo { animation: none; opacity: 0.5; } }
.leaflet-control-zoom a { width: ${MARKER_SIZE}px; height: ${MARKER_SIZE}px; line-height: ${MARKER_SIZE}px; font-size: ${iconSizes.md}px; }`;
}
