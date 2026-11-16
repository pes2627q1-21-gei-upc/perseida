import { breakpoints } from '../../shared/theme';
import { isWide } from './useIsWide';

describe('isWide', () => {
  it('puts the summary beside the map from tablet width up', () => {
    expect(isWide(breakpoints.tablet - 1)).toBe(false);
    expect(isWide(breakpoints.tablet)).toBe(true);
    expect(isWide(breakpoints.desktop)).toBe(true);
  });
});
