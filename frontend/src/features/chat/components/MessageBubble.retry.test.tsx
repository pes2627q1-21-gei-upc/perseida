import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

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
// would be lost: it moves to the bubble, which then reads that it is being sent (TG-469).
describe('MessageBubble, focus after retrying (TG-469)', () => {
  it('retries first and then moves the screen reader focus to the bubble', async () => {
    const order: string[] = [];
    const onRetry = jest.fn(() => order.push('retry'));
    const focus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => order.push('focus'));
    await render(<MessageBubble item={failed} onRetry={onRetry} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Reintenta' }));

    expect(onRetry).toHaveBeenCalledWith('client-1');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith(expect.any(Number));
    expect(order).toEqual(['retry', 'focus']);
  });
});
