// Colours per theme. Values from the estetica-frutiger-cosmo skill (references/tokens.md),
// agreed on 2026-10-13 (ADR-0020). Contrasts are measured there: recalculate if you change one.

export type ThemeName = 'dia' | 'posta' | 'nit' | 'vermell';

export interface ThemeColors {
  sky: { top: string; low: string };
  surface: { glass: string; glassSolid: string; glassBorder: string };
  text: { primary: string; secondary: string };
  brand: string;
  /** Fill only, never text. */
  brandFill: string;
  accentGlow: string;
  /**
   * Colour variants of the Perseid streaks of the sign-in screen: the bright head and the
   * colour of the tail. Decorative; every head reads on the whole sky of its theme.
   */
  meteors: { head: string; tail: string }[];
  state: { success: string; warning: string; danger: string };
  focusRing: string;
  /**
   * The lake of the "Cel viu" scene: water, light, meadow around it and wild flowers.
   * Decorative: no text of the app sits on it without a glass layer, except the title and
   * quiet buttons, which keep their contrast over the water (checked by a test).
   */
  lake: {
    /** Water at the far shore (reflects the horizon) and at the near shore (deep). */
    waterTop: string;
    waterBottom: string;
    /** Sun or moon behind the hills and its glitter on the water. */
    glow: string;
    glitter: string;
    hillFar: string;
    hillNear: string;
    /** Meadow of the banks, sunlit at the crest and dark at the foot. */
    grassLight: string;
    grassDark: string;
    /** Light on the edge where the meadow meets the water. */
    rim: string;
    flowers: string[];
  };
  /** Gel (main action button). The highlight must stay above the text: see tokens.md. */
  gel: {
    body: [string, string];
    bodyPressed: string;
    highlight: [string, string];
    rim: string;
    text: string;
  };
}

export const colors: Record<ThemeName, ThemeColors> = {
  dia: {
    sky: { top: '#5EC8F2', low: '#BFE9F7' },
    surface: {
      glass: 'rgba(255,255,255,0.78)',
      glassSolid: '#F4FBFE',
      glassBorder: 'rgba(255,255,255,0.65)',
    },
    text: { primary: '#10223F', secondary: '#3A4F6E' },
    brand: '#4B4BD8',
    brandFill: '#5B5BF0',
    accentGlow: '#1FA8E0',
    lake: {
      waterTop: '#9FDDF5',
      waterBottom: '#2F9BD8',
      glow: '#FFF3C8',
      glitter: '#FFFFFF',
      hillFar: '#A7DB88',
      hillNear: '#5FB83F',
      grassLight: '#6DBE45',
      grassDark: '#2E8A2B',
      rim: '#C8F5A0',
      flowers: ['#FFFFFF', '#FFD84D', '#FF8FB1'],
    },
    meteors: [
      { head: '#4B4BD8', tail: '#4B4BD8' },
      { head: '#7B2FBE', tail: '#7B2FBE' },
      { head: '#B3261E', tail: '#B3261E' },
      { head: '#0B4F8A', tail: '#0B4F8A' },
      { head: '#9D174D', tail: '#9D174D' },
    ],
    state: { success: '#2A7419', warning: '#8A5A00', danger: '#B3261E' },
    focusRing: '#0B78B5',
    gel: {
      body: ['#096AA3', '#075F94'],
      bodyPressed: '#054B73',
      highlight: ['rgba(255,255,255,0.40)', 'rgba(255,255,255,0.14)'],
      rim: '#1FA8E0',
      text: '#FFFFFF',
    },
  },
  posta: {
    sky: { top: '#2B2F6B', low: '#E8885A' },
    surface: {
      glass: 'rgba(10,20,48,0.62)',
      glassSolid: '#1B2350',
      glassBorder: 'rgba(255,255,255,0.28)',
    },
    text: { primary: '#EAF4FF', secondary: '#B4C6E6' },
    brand: '#B3B3FF',
    brandFill: '#5B5BF0',
    accentGlow: '#2EE6D6',
    lake: {
      waterTop: '#F0A070',
      waterBottom: '#2B2F6B',
      glow: '#FFC58A',
      glitter: '#FFE2B8',
      hillFar: '#8A6A8E',
      hillNear: '#3F6B4A',
      grassLight: '#5E8F4F',
      grassDark: '#2E5A3C',
      rim: '#F2B36B',
      flowers: ['#FFE2B8', '#FFC58A', '#FFB3C8'],
    },
    meteors: [
      { head: '#FFFFFF', tail: '#2EE6D6' },
      { head: '#FFE9A8', tail: '#F2B33D' },
      { head: '#E4DAFF', tail: '#B3B3FF' },
      { head: '#D4FFE6', tail: '#4CFF9A' },
      { head: '#FFC8D8', tail: '#FF9A92' },
    ],
    state: { success: '#6FD65A', warning: '#F2B33D', danger: '#FF9A92' },
    focusRing: '#2EE6D6',
    gel: {
      body: ['#096AA3', '#075F94'],
      bodyPressed: '#054B73',
      highlight: ['rgba(255,255,255,0.40)', 'rgba(255,255,255,0.14)'],
      rim: '#1FA8E0',
      text: '#FFFFFF',
    },
  },
  nit: {
    sky: { top: '#0A1430', low: '#13265A' },
    surface: {
      glass: 'rgba(255,255,255,0.12)',
      glassSolid: '#22305F',
      glassBorder: 'rgba(255,255,255,0.28)',
    },
    text: { primary: '#EAF4FF', secondary: '#B4C6E6' },
    brand: '#B3B3FF',
    brandFill: '#5B5BF0',
    accentGlow: '#2EE6D6',
    lake: {
      waterTop: '#1B3A78',
      waterBottom: '#0A1430',
      glow: '#CFE0FF',
      glitter: '#EAF4FF',
      hillFar: '#1C3F66',
      hillNear: '#103447',
      grassLight: '#1F5A4E',
      grassDark: '#0F3A3A',
      rim: '#2EE6D6',
      flowers: ['#B3B3FF', '#EAF4FF', '#2EE6D6'],
    },
    meteors: [
      { head: '#FFFFFF', tail: '#2EE6D6' },
      { head: '#FFE9A8', tail: '#F2B33D' },
      { head: '#E4DAFF', tail: '#B3B3FF' },
      { head: '#D4FFE6', tail: '#4CFF9A' },
      { head: '#FFC8D8', tail: '#FF9A92' },
    ],
    state: { success: '#6FD65A', warning: '#F2B33D', danger: '#FF9A92' },
    focusRing: '#2EE6D6',
    gel: {
      body: ['#096AA3', '#075F94'],
      bodyPressed: '#054B73',
      highlight: ['rgba(255,255,255,0.40)', 'rgba(255,255,255,0.14)'],
      rim: '#1FA8E0',
      text: '#FFFFFF',
    },
  },
  // No blues or greens: states are told apart by icon + text, not by colour.
  vermell: {
    sky: { top: '#14060A', low: '#2A0B12' },
    surface: {
      glass: 'rgba(255,107,94,0.10)',
      glassSolid: '#3A141A',
      glassBorder: 'rgba(255,140,125,0.30)',
    },
    text: { primary: '#FFB3A7', secondary: '#E08A7E' },
    brand: '#FF6B5E',
    brandFill: '#FF6B5E',
    accentGlow: '#FF8A7A',
    lake: {
      waterTop: '#3A1218',
      waterBottom: '#14060A',
      glow: '#FF8A7A',
      glitter: '#FFB3A7',
      hillFar: '#35121A',
      hillNear: '#4A1820',
      grassLight: '#5A1E26',
      grassDark: '#3A1018',
      rim: '#FF6B5E',
      flowers: ['#FFB3A7', '#FF8A7A', '#FFD9D2'],
    },
    meteors: [
      { head: '#FFB3A7', tail: '#FF8A7A' },
      { head: '#FFD9D2', tail: '#FF6B5E' },
      { head: '#FFC3A0', tail: '#FF9E6B' },
      { head: '#FF8A7A', tail: '#E08A7E' },
    ],
    state: { success: '#FFB3A7', warning: '#FFB3A7', danger: '#FFB3A7' },
    focusRing: '#FF8A7A',
    gel: {
      body: ['#FF6B5E', '#FF6B5E'],
      // tokens.md only fixes body and text for vermell; pressed and rim reuse existing vermell values (to confirm).
      bodyPressed: '#FF6B5E',
      highlight: ['rgba(255,255,255,0.40)', 'rgba(255,255,255,0.14)'],
      rim: '#FF8A7A',
      text: '#1A0508',
    },
  },
};
