import type { ThemeColors } from '../../shared/theme';
import { rowSurface } from './rowSurface';

/** 8 % of the accent over the glass, as hex alpha: text stays at 4.5:1 on every theme. */
const TINT_ALPHA = '14';

export interface BubbleSurface {
  /** Fill of the bubble: the glass of a chat row. */
  background: string;
  /** Veil of the accent colour over the glass. Only my bubbles have it. */
  tint?: string;
  text: string;
  /** Author and time: smaller, still at 4.5:1 on the bubble. */
  secondaryText: string;
  border: string;
}

/**
 * Surface of a chat bubble (TG-469). Both are the glass of a chat row, without blur (a blur per
 * bubble would be too heavy for a list): translucent, and opaque with «Reduce transparency».
 * Mine is tinted with the accent, a veil over that glass and an accent border; the gel is only
 * for actions, and a message is content. The text keeps the glass colours, measured at 4.5:1
 * over the whole scene with the veil on.
 */
export function bubbleSurface(
  colors: ThemeColors,
  mine: boolean,
  reduceTransparency: boolean,
): BubbleSurface {
  const background = rowSurface(colors.surface, reduceTransparency);
  if (mine) {
    return {
      background,
      tint: `${colors.accentGlow}${TINT_ALPHA}`,
      text: colors.text.primary,
      secondaryText: colors.text.secondary,
      border: colors.accentGlow,
    };
  }
  return {
    background,
    text: colors.text.primary,
    secondaryText: colors.text.secondary,
    border: colors.surface.glassBorder,
  };
}
