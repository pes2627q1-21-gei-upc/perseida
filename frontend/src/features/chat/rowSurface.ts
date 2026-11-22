import type { ThemeColors } from '../../shared/theme';

/** 92 % opaque, as hex alpha: measured at 4.5:1 for both text colours over the whole scene. */
const ROW_ALPHA = 'EB';

/**
 * Surface of a chat row (TG-469). A row has no blur, so the glass tokens (62-80 %, made for a
 * blurred layer) are not enough over the light parts of the scene: the solid glass colour
 * with a little transparency is. With «Reduce transparency» it is fully opaque.
 */
export function rowSurface(surface: ThemeColors['surface'], reduceTransparency: boolean): string {
  return reduceTransparency ? surface.glassSolid : `${surface.glassSolid}${ROW_ALPHA}`;
}
