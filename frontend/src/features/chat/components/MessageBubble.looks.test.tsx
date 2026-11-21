import { render, screen } from '@testing-library/react-native';

import { makeMessage } from '../../../../__mocks__/chat';
import { colors } from '../../../shared/theme';
import type { ChatMessage } from '../api/chat';
import type { MessageItem, PendingItem } from '../chatItems';
import { MessageBubble } from './MessageBubble';

function messageItem(mine: boolean): MessageItem {
  const message = makeMessage(1) as ChatMessage;
  return { kind: 'message', key: message.id, message, mine, showAuthor: false };
}
function pendingItem(status: PendingItem['status']): PendingItem {
  return { kind: 'pending', key: 'client-1', clientMessageId: 'client-1', text: 'Hola', status };
}
// The gradients and the icons as plain views that say what they are, so the test can read them.
jest.mock('expo-linear-gradient', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    LinearGradient: ({ colors: stops }: { colors: string[] }) =>
      createElement(View, { testID: 'gradient', stops }),
  };
});
jest.mock('phosphor-react-native', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const icon = (name: string) => () => createElement(View, { testID: `icon-${name}` });
  return {
    ...jest.requireActual('phosphor-react-native'),
    Warning: icon('Warning'),
    WarningCircle: icon('WarningCircle'),
  };
});

function gradients() {
  return screen
    .queryAllByTestId('gradient', { includeHiddenElements: true })
    .map((gradient) => gradient.props.stops);
}
function icons(name: string) {
  return screen.queryAllByTestId(`icon-${name}`, { includeHiddenElements: true });
}

// What the kind and the state of a bubble change besides its texts (TG-469).
describe('MessageBubble, material (TG-469)', () => {
  const { gel } = colors.dia;

  it('mine is a drop of gel with its gloss', async () => {
    await render(<MessageBubble item={messageItem(true)} />);

    expect(gradients()).toEqual([gel.body, gel.highlight]);
  });

  it('mine on its way is matte gel: no gloss yet', async () => {
    await render(<MessageBubble item={pendingItem('sending')} />);

    expect(gradients()).toEqual([gel.body]);
  });

  it('the others’ is glass with only a highlight line', async () => {
    await render(<MessageBubble item={messageItem(false)} />);

    expect(gradients()).toEqual([gel.highlight]);
  });
});

describe('MessageBubble, state signs (TG-469)', () => {
  it('the pulsing dot of a message on its way is hidden from the screen reader', async () => {
    await render(<MessageBubble item={pendingItem('sending')} />);

    const dot = screen.getByTestId('chat-sending-dot', { includeHiddenElements: true });
    expect(dot.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });

  it.each([
    ['failed', 'WarningCircle', 'Warning'],
    ['uncertain', 'Warning', 'WarningCircle'],
  ] as const)('%s: its own icon, hidden from the screen reader', async (status, shown, other) => {
    await render(<MessageBubble item={pendingItem(status)} onRetry={jest.fn()} />);

    expect(icons(shown)).toHaveLength(1);
    expect(icons(other)).toHaveLength(0);
    const icon = screen.getByTestId('chat-message-problem-icon', { includeHiddenElements: true });
    expect(icon.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });

  it('the reason it did not go is a polite live region (Android reads it by itself)', async () => {
    await render(<MessageBubble item={pendingItem('failed')} onRetry={jest.fn()} />);

    expect(
      screen.getByText("No s'ha pogut enviar el missatge.").props.accessibilityLiveRegion,
    ).toBe('polite');
  });
});
