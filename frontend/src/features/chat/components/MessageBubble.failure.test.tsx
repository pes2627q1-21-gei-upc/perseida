import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import type { PendingItem } from '../chatItems';
import { MessageBubble } from './MessageBubble';
import { MessageList } from './MessageList';

const pending = (overrides: Partial<PendingItem>): PendingItem => ({
  kind: 'pending',
  key: 'client-1',
  clientMessageId: 'client-1',
  text: 'Hola a tothom',
  status: 'failed',
  ...overrides,
});

const REJECTED =
  'Aquest missatge no es pot publicar perquè no compleix les normes de la comunitat.';
const RATE_LIMITED = 'Hi ha molta activitat ara mateix. Espera una mica i torna-ho a provar.';

afterEach(() => jest.restoreAllMocks());

// TG-469 (review of PR D): a refused message keeps its reason in its bubble, and the person
// decides there whether to retry it (only when that can work) or to discard it.
describe('MessageBubble, a refused message (TG-469, US TG-64 criteri 16)', () => {
  it('says why it was refused, with no retry when retrying cannot work', async () => {
    await render(
      <MessageBubble
        item={pending({ error: { code: 'CHAT_MESSAGE_REJECTED', retryable: false } })}
        onRetry={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );

    expect(screen.getByText(REJECTED)).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(screen.queryByText("No s'ha pogut enviar el missatge.")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintenta' })).toBeNull();
  });

  it('offers to retry a refusal that can go through later', async () => {
    const onRetry = jest.fn();
    await render(
      <MessageBubble
        item={pending({ error: { code: 'RATE_LIMITED', retryable: true } })}
        onRetry={onRetry}
        onDiscard={jest.fn()}
      />,
    );

    expect(screen.getByText(RATE_LIMITED)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintenta' }));
    expect(onRetry).toHaveBeenCalledWith('client-1');
  });

  it.each([
    ['CHAT_MESSAGE_REJECTED', false],
    ['RATE_LIMITED', true],
  ])('lets the person discard a refused message (%s)', async (code, retryable) => {
    const onDiscard = jest.fn();
    await render(
      <MessageBubble
        item={pending({ error: { code, retryable } })}
        onRetry={jest.fn()}
        onDiscard={onDiscard}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Descarta' }));

    expect(onDiscard).toHaveBeenCalledWith('client-1');
  });

  it('does not offer to discard a message that may have arrived (uncertain)', async () => {
    await render(
      <MessageBubble
        item={pending({ status: 'uncertain' })}
        onRetry={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reintenta' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Descarta' })).toBeNull();
  });

  it('reads out on iOS why the message was refused', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await render(
      <MessageBubble
        item={pending({ error: { code: 'CHAT_MESSAGE_REJECTED', retryable: false } })}
        onDiscard={jest.fn()}
      />,
    );

    expect(announce).toHaveBeenCalledWith(REJECTED);
  });
});

describe('MessageList, a refused message (TG-469)', () => {
  it('passes the discard of a bubble on', async () => {
    const onDiscard = jest.fn();
    await render(
      <MessageList
        items={[pending({ error: { code: 'CHAT_MESSAGE_REJECTED', retryable: false } })]}
        hasMore={false}
        isFetchingMore={false}
        onLoadOlder={jest.fn()}
        onRetry={jest.fn()}
        onDiscard={onDiscard}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Descarta' }));

    expect(onDiscard).toHaveBeenCalledWith('client-1');
  });
});
