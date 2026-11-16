import { useColorScheme } from 'react-native';

import { type ThemeColors, type ThemeName, colors } from './colors';
import { blur, breakpoints, duration, iconSizes, radii, spacing, touch } from './layout';
import { typography } from './typography';

export interface Theme {
  name: ThemeName;
  colors: ThemeColors;
  typography: typeof typography;
  radii: typeof radii;
  spacing: typeof spacing;
  touch: typeof touch;
  iconSizes: typeof iconSizes;
  breakpoints: typeof breakpoints;
  duration: typeof duration;
  blur: typeof blur;
}

export function buildTheme(name: ThemeName): Theme {
  return {
    name,
    colors: colors[name],
    typography,
    radii,
    spacing,
    touch,
    iconSizes,
    breakpoints,
    duration,
    blur,
  };
}

/**
 * Current theme. For now it follows the system: light = `dia`, dark = `nit`.
 * The four modes (Clar, Fosc, Seguir sistema, Seguir Sol) and the red switch
 * belong to the settings screen and are not implemented yet.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return buildTheme(scheme === 'dark' ? 'nit' : 'dia');
}
