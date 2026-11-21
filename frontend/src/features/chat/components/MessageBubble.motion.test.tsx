import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { withRepeat, withTiming } from 'react-native-reanimated';

import { makeMessage } from '../../../../__mocks__/chat';
import type { ChatMessage } from '../api/chat';
import type { MessageItem, PendingItem } from '../chatItems';
import { MessageBubble } from './MessageBubble';

// The stand-in of Reanimated, with the animations as spies and reduced motion under control.
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => {
  const standIn = jest.requireActual('../../../../__mocks__/react-native-reanimated');
  return {
    __esModule: true,
    ...standIn,
    useReducedMotion: () => mockReduceMotion,
    withTiming: jest.fn(standIn.withTiming),
    withRepeat: jest.fn(standIn.withRepeat),
  };
});

const message = makeMessage(1) as ChatMessage;
const item: MessageItem = {
  kind: 'message',
  key: message.id,
  message,
  mine: false,
  showAuthor: false,
};
const sending: PendingItem = {
  kind: 'pending',
  key: 'client-1',
  clientMessageId: 'client-1',
  text: 'Hola',
  status: 'sending',
};
function frameOpacity() {
  const frame = screen.getByTestId(`chat-message-${item.key}`).parent;
  return StyleSheet.flatten(frame?.props.style)?.opacity;
}

beforeEach(() => {
  mockReduceMotion = false;
  jest.clearAllMocks();
});

describe('MessageBubble, motion (TG-469)', () => {
  it('a message that has just arrived floats in', async () => {
    await render(<MessageBubble item={item} entering />);

    expect(frameOpacity()).toBe(0);
    expect(withTiming).toHaveBeenCalledTimes(1);
  });

  it('the entrance lasts the fast duration of the theme, a reply that must not make anyone wait', async () => {
    await render(<MessageBubble item={item} entering />);

    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 120 }));
  });

  it('a message of the history is there at once, with no animation', async () => {
    await render(<MessageBubble item={item} />);

    expect(frameOpacity()).toBe(1);
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('with reduced motion, a message that has just arrived is there at once', async () => {
    mockReduceMotion = true;

    await render(<MessageBubble item={item} entering />);

    expect(frameOpacity()).toBe(1);
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('a message on its way pulses for ever, back and forth', async () => {
    await render(<MessageBubble item={sending} />);

    expect(withRepeat).toHaveBeenCalledTimes(1);
    expect(withRepeat).toHaveBeenCalledWith(expect.anything(), -1, true);
  });

  it('with reduced motion, a message on its way does not pulse', async () => {
    mockReduceMotion = true;

    await render(<MessageBubble item={sending} />);

    expect(withRepeat).not.toHaveBeenCalled();
  });
});
