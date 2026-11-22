import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { withTiming } from 'react-native-reanimated';

import { colors } from '../../../shared/theme';
import { UnreadBadge } from './UnreadBadge';

// The stand-in of Reanimated, with the animation as a spy and reduced motion under control.
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => {
  const standIn = jest.requireActual('../../../../__mocks__/react-native-reanimated');
  return {
    __esModule: true,
    ...standIn,
    useReducedMotion: () => mockReduceMotion,
    withTiming: jest.fn(standIn.withTiming),
  };
});

beforeEach(() => {
  mockReduceMotion = false;
  jest.clearAllMocks();
});

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe('UnreadBadge (TG-65)', () => {
  it('renders nothing when there is nothing unread', async () => {
    await render(<UnreadBadge count={0} />);

    expect(screen.queryByTestId('unread-badge')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it.each([
    [1, '1'],
    [99, '99'],
    [100, '99+'],
    [2500, '99+'],
  ])('shows %i as «%s»', async (count, text) => {
    await render(<UnreadBadge count={count} />);

    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it('is named in the singular for one message', async () => {
    await render(<UnreadBadge count={1} />);

    expect(screen.getByLabelText('1 missatge sense llegir')).toBeOnTheScreen();
  });

  it('is named in the plural from two messages', async () => {
    await render(<UnreadBadge count={5} />);

    expect(screen.getByLabelText('5 missatges sense llegir')).toBeOnTheScreen();
  });

  it('reads 100 or more as the real number, though it shows «99+»', async () => {
    await render(<UnreadBadge count={137} />);

    expect(screen.getByLabelText('137 missatges sense llegir')).toBeOnTheScreen();
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });

  it('is one accessible element, so the number is not read twice', async () => {
    await render(<UnreadBadge count={5} />);

    expect(screen.getByTestId('unread-badge').props.accessible).toBe(true);
  });

  it('is filled with the brand fill of the theme, with the text of the gel on it', async () => {
    await render(<UnreadBadge count={5} />);

    const fill = StyleSheet.flatten(screen.getByTestId('unread-badge').props.style);
    expect(fill.backgroundColor).toBe(colors.dia.brandFill);
    expect(StyleSheet.flatten(screen.getByText('5').props.style).color).toBe(colors.dia.gel.text);
  });

  it.each(['dia', 'posta', 'nit', 'vermell'] as const)(
    '%s: the number reads on the fill at 4.5:1 or more (WCAG AA)',
    (name) => {
      expect(contrast(colors[name].gel.text, colors[name].brandFill)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('pops in with a short animation', async () => {
    await render(<UnreadBadge count={3} />);

    expect(withTiming).toHaveBeenCalledTimes(1);
  });

  it('does not animate, and shows at full size, under reduced motion', async () => {
    mockReduceMotion = true;
    await render(<UnreadBadge count={3} />);

    expect(withTiming).not.toHaveBeenCalled();
    const style = StyleSheet.flatten(screen.getByTestId('unread-badge').parent?.props.style);
    expect(style.opacity).toBe(1);
    expect(style.transform).toEqual([{ scale: 1 }]);
  });
});
