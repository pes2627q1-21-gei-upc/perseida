import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { makeMessage } from '../../../../__mocks__/chat';
import type { ChatMessage } from '../api/chat';
import type { MessageItem } from '../chatItems';
import { MessageBubble } from './MessageBubble';

// Reduced motion on: the stand-in of Reanimated always says «no», so this file says «yes».
jest.mock('react-native-reanimated', () => {
  const standIn = jest.requireActual('../../../../__mocks__/react-native-reanimated');
  return { __esModule: true, ...standIn, useReducedMotion: () => true };
});

const message = makeMessage(1, { sent_at: '2026-11-17T10:00:00Z' }) as ChatMessage;
const item: MessageItem = {
  kind: 'message',
  key: message.id,
  message,
  mine: false,
  showAuthor: true,
};

describe('MessageBubble with reduced motion (TG-469)', () => {
  it('is fully visible from the first frame, not floating in', async () => {
    await render(<MessageBubble item={item} />);

    // Nothing from the bubble up is faded out or moved.
    let node = screen.getByTestId(`chat-message-${item.key}`).parent;
    while (node) {
      const style = StyleSheet.flatten(node.props.style);
      if (style?.opacity !== undefined) expect(style.opacity).toBe(1);
      if (style?.transform) expect(style.transform).toEqual([{ translateY: 0 }]);
      node = node.parent;
    }
    expect(screen.getByTestId(`chat-message-${item.key}`)).toBeOnTheScreen();
  });
});
