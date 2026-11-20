import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import * as ReactNative from 'react-native';

import { colors, type ThemeName } from '../../../shared/theme';
import type { PendingItem } from '../chatItems';
import { rowSurface } from '../rowSurface';
import { MessageBubble } from './MessageBubble';

function luminance([r, g, b]: number[]) {
  const [lr, lg, lb] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
function contrast(a: number[], b: number[]) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
/** What the eye sees: a surface (#RRGGBB or #RRGGBBAA) over a background. */
function over(surface: string, background: string) {
  const alpha = surface.length === 9 ? parseInt(surface.slice(7, 9), 16) / 255 : 1;
  const back = rgb(background);
  return rgb(surface).map((channel, i) => channel * alpha + (back[i] ?? 0) * (1 - alpha));
}
/** Every colour of the scene the actions can sit on: the sky and the whole lake, glitter too. */
function scene(name: ThemeName) {
  const { sky, lake } = colors[name];
  const { flowers, ...rest } = lake;
  return [sky.top, sky.low, ...Object.values(rest), ...flowers];
}
/** The colour painted right behind a button: the first ancestor that has a background. */
function behind(button: ReturnType<typeof screen.getByRole>) {
  let node = button.parent;
  while (node) {
    const { backgroundColor } = StyleSheet.flatten(node.props.style) ?? {};
    if (typeof backgroundColor === 'string') return backgroundColor;
    node = node.parent;
  }
  return undefined;
}

const failed: PendingItem = {
  kind: 'pending',
  key: 'client-1',
  clientMessageId: 'client-1',
  text: 'Hola a tothom',
  status: 'failed',
};
const ACTIONS = ['Reintenta', 'Descarta'];

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

// «Reintenta» and «Descarta» are quiet buttons (a rim and no fill): they sit right on the scene,
// and over the pale lake and the moon glow their text was not legible (WCAG 1.4.3, found in a real
// browser). They sit on the opaque glass of the rows, as the note next to them does.
describe('MessageBubble, the actions of a message that did not go (TG-469, WCAG 1.4.3)', () => {
  describe.each([
    ['dia', 'light'],
    ['nit', 'dark'],
  ] as const)('%s', (name, scheme) => {
    beforeEach(() => jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme));

    it.each(ACTIONS)('«%s» sits on the glass of the rows', async (label) => {
      await render(<MessageBubble item={failed} onRetry={jest.fn()} onDiscard={jest.fn()} />);

      const surface = behind(screen.getByRole('button', { name: label }));

      expect(surface).toBe(rowSurface(colors[name].surface, false));
    });

    it.each(ACTIONS)('«%s» reads at 4.5:1 over any colour of the scene', async (label) => {
      await render(<MessageBubble item={failed} onRetry={jest.fn()} onDiscard={jest.fn()} />);

      const surface = behind(screen.getByRole('button', { name: label }));

      expect(surface).toBeDefined();
      scene(name).forEach((background) => {
        const seen = over(surface!, background);
        expect(contrast(rgb(colors[name].text.primary), seen)).toBeGreaterThanOrEqual(4.5);
      });
    });
  });

  it('the surface is opaque with «Reduce transparency»', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    await render(<MessageBubble item={failed} onRetry={jest.fn()} onDiscard={jest.fn()} />);

    const surface = behind(await screen.findByRole('button', { name: 'Reintenta' }));

    expect(surface).toBe(colors.dia.surface.glassSolid);
  });
});
