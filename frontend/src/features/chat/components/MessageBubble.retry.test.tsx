import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, View } from 'react-native';

import type { PendingItem } from '../chatItems';
import { MessageBubble } from './MessageBubble';

const failed: PendingItem = {
  kind: 'pending',
  key: 'client-1',
  clientMessageId: 'client-1',
  text: 'Hola a tothom',
  status: 'failed',
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

// «Reintenta» goes away as soon as the message is sent again, so the focus of the screen reader
// would be lost: it moves to the bubble, which then reads that it is being sent (TG-469). It uses
// sendAccessibilityEvent on the bubble: setAccessibilityFocus with a node handle is deprecated and
// findNodeHandle gives nothing under the new architecture.
describe('MessageBubble, focus after retrying (TG-469)', () => {
  it('retries first and then moves the screen reader focus to the bubble', async () => {
    const order: string[] = [];
    const onRetry = jest.fn(() => order.push('retry'));
    const focus = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => order.push('focus'));
    await render(<MessageBubble item={failed} onRetry={onRetry} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Reintenta' }));

    expect(onRetry).toHaveBeenCalledWith('client-1');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    expect(order).toEqual(['retry', 'focus']);
  });

  it('leaves the bubble as it is on a phone: no tab index', async () => {
    await render(<MessageBubble item={failed} onRetry={jest.fn()} />);
    expect(screen.getByTestId('chat-message-client-1').props.tabIndex).toBeUndefined();
  });

  // react-native-web does not implement sendAccessibilityEvent: calling it threw «is not a
  // function» after the retry had already gone out (found in a real browser). There the focus
  // goes to the bubble element itself, which can take it.
  describe('on the web, where AccessibilityInfo.sendAccessibilityEvent does not exist', () => {
    const native = AccessibilityInfo.sendAccessibilityEvent;
    beforeEach(() => {
      (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent =
        undefined;
    });
    afterEach(() => {
      AccessibilityInfo.sendAccessibilityEvent = native;
    });

    it('still retries with the same clientMessageId and does not throw', async () => {
      const onRetry = jest.fn();
      await render(<MessageBubble item={failed} onRetry={onRetry} />);

      await expect(
        fireEvent.press(screen.getByRole('button', { name: 'Reintenta' })),
      ).resolves.not.toThrow();

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith('client-1');
    });

    it('puts the focus on the bubble element instead', async () => {
      const focus = jest
        .spyOn((View as unknown as { prototype: { focus: () => void } }).prototype, 'focus')
        .mockImplementation(() => undefined);
      await render(<MessageBubble item={failed} onRetry={jest.fn()} />);

      await fireEvent.press(screen.getByRole('button', { name: 'Reintenta' }));

      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('the bubble can take the focus there, out of the tab order', async () => {
      jest.replaceProperty(Platform, 'OS', 'web');
      await render(<MessageBubble item={failed} onRetry={jest.fn()} />);
      expect(screen.getByTestId('chat-message-client-1').props.tabIndex).toBe(-1);
    });
  });
});
