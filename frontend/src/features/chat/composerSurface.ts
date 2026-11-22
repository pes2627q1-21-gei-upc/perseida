import type { ThemeColors } from '../../shared/theme';
import { rowSurface } from './rowSurface';

export interface ComposerSurface {
  /** The floating layer: the reason it cannot send, the alerts and the counter sit on it. */
  panel: string;
  /** The field, on the panel: what is typed and its placeholder sit on it. */
  field: string;
}

/**
 * Surfaces of the composer (TG-469). The glass tokens are made for a blurred layer and, without a
 * blur behind, the posta glass leaves state.danger at 2.9:1 over the light lake: the panel is the
 * glass of a chat row instead (translucent, opaque with «Reduce transparency»), and the field is
 * the solid glass colour, so the text typed reads the same whatever is behind.
 */
export function composerSurface(colors: ThemeColors, reduceTransparency: boolean): ComposerSurface {
  return {
    panel: rowSurface(colors.surface, reduceTransparency),
    field: colors.surface.glassSolid,
  };
}
