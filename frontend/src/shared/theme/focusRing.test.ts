import { colors, focusRingShadow, focusRingWidth } from './index';

// Visible keyboard focus (WCAG 2.2 AA 2.4.7 and 2.4.13): one ring for every focusable element.
describe('focus ring token', () => {
  it('is 3 px wide, more than the 2 px WCAG 2.4.13 asks for', () => {
    expect(focusRingWidth).toBe(3);
  });

  it('draws the ring as a solid outline of the given colour', () => {
    expect(focusRingShadow('#0B78B5')).toBe('0 0 0 3px #0B78B5');
  });

  it('works with the focus colour of every theme', () => {
    for (const theme of Object.values(colors)) {
      expect(focusRingShadow(theme.focusRing)).toBe(`0 0 0 3px ${theme.focusRing}`);
    }
  });
});
