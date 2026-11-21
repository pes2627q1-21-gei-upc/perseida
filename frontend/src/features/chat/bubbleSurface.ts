import type { ThemeColors } from '../../shared/theme';
import { rowSurface } from './rowSurface';

export interface BubbleSurface {
  /** Fill of the bubble; with a gradient, its first stop (what is under the text at the top). */
  background: string;
  /** The gel body, top to bottom. Only my bubbles have it. */
  gradient?: [string, string];
  text: string;
  /** Author and time: smaller, still at 4.5:1 on the bubble. */
  secondaryText: string;
  border: string;
}

/**
 * Surface of a chat bubble (TG-469). Mine is the gel of the main button, opaque, so its text has
 * the contrast measured for the button. The others' is glass without blur, the same as a chat
 * row (a blur per bubble would be too heavy for a list): translucent, and opaque with «Reduce
 * transparency».
 */
export function bubbleSurface(
  colors: ThemeColors,
  mine: boolean,
  reduceTransparency: boolean,
): BubbleSurface {
  if (mine) {
    const { gel } = colors;
    return {
      background: gel.body[0],
      gradient: gel.body,
      text: gel.text,
      secondaryText: gel.text,
      border: gel.rim,
    };
  }
  return {
    background: rowSurface(colors.surface, reduceTransparency),
    text: colors.text.primary,
    secondaryText: colors.text.secondary,
    border: colors.surface.glassBorder,
  };
}
