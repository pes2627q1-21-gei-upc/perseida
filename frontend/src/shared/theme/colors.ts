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
  state: { success: string; warning: string; danger: string };
  focusRing: string;
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
