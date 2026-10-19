// Shape, spacing and motion tokens from tokens.md (ADR-0020).

export const radii = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Minimum touch target: 44 pt (iOS) / 48 dp (Android). */
export const touch = { min: 48 } as const;

export const iconSizes = { sm: 20, md: 24, lg: 32 } as const;

export const breakpoints = {
  phoneSmall: 360,
  phone: 390,
  tablet: 768,
  desktop: 1280,
  wide: 1536,
} as const;

export const duration = { fast: 120, base: 220, slow: 420 } as const;

/** Blur intensity of glass layers (expo-blur, 1-100). */
export const blur = { glassLight: 40, glassStrong: 70 } as const;

/** Readable line length on wide screens. */
export const readingMaxWidth = 720;
