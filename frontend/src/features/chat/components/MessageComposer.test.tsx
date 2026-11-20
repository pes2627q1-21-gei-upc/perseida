import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MessageComposer } from './MessageComposer';

/** Same limit as the server (code points); the server stays the real check. */
const MAX = 1000;
const LABEL = 'Escriu un missatge';

function field() {
  return screen.getByLabelText(LABEL);
}
function sendButton() {
  return screen.getByRole('button', { name: 'Envia' });
}
async function type(text: string) {
  await fireEvent.changeText(field(), text);
}

describe('MessageComposer (TG-469)', () => {
  it('has a labelled multiline field and a visible counter (WCAG 1.3.1, 3.3.2)', async () => {
    await render(<MessageComposer onSend={jest.fn()} />);

    expect(field().props.multiline).toBe(true);
    expect(screen.getByPlaceholderText(LABEL)).toBe(field());
    expect(screen.getByLabelText('0 de 1000 caràcters')).toHaveTextContent('0/1000');
  });

  it('the Enter key adds a line, it does not send', async () => {
    const onSend = jest.fn();
    await render(<MessageComposer onSend={onSend} />);
    await type('Hola');

    await fireEvent(field(), 'submitEditing', { nativeEvent: { text: 'Hola' } });

    expect(field().props.submitBehavior).not.toBe('submit');
    expect(onSend).not.toHaveBeenCalled();
  });

  describe('what can be sent', () => {
    it.each(['', '   ', '\n \n'])('cannot send an empty or blank text (%j)', async (text) => {
      const onSend = jest.fn();
      await render(<MessageComposer onSend={onSend} />);
      await type(text);

      expect(sendButton().props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(sendButton());
      expect(onSend).not.toHaveBeenCalled();
    });

    it('counts the trimmed text and allows exactly the limit', async () => {
      await render(<MessageComposer onSend={jest.fn()} />);

      await type(`  ${'a'.repeat(MAX)}  `);

      expect(screen.getByLabelText('1000 de 1000 caràcters')).toBeOnTheScreen();
      expect(sendButton().props.accessibilityState.disabled).toBe(false);
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });

    it('counts characters as the server does, so an emoji counts once', async () => {
      await render(<MessageComposer onSend={jest.fn()} />);

      await type('🔭'.repeat(MAX));

      expect(screen.getByLabelText('1000 de 1000 caràcters')).toBeOnTheScreen();
      expect(sendButton().props.accessibilityState.disabled).toBe(false);
    });

    it('over the limit it says so in an alert, blocks sending and never cuts the text', async () => {
      const onSend = jest.fn();
      await render(<MessageComposer onSend={onSend} />);
      const tooLong = 'a'.repeat(MAX + 1);

      await type(tooLong);

      expect(screen.getByLabelText('1001 de 1000 caràcters')).toBeOnTheScreen();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'El missatge pot tenir com a màxim 1.000 caràcters.',
      );
      expect(sendButton().props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(sendButton());
      expect(onSend).not.toHaveBeenCalled();
      expect(field().props.value).toBe(tooLong);
    });

    it('the alert goes away when the text is short enough again', async () => {
      await render(<MessageComposer onSend={jest.fn()} />);
      await type('a'.repeat(MAX + 1));

      await type('a'.repeat(MAX));

      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
  });

  describe('sending', () => {
    it('sends the text without the blanks around it', async () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      await render(<MessageComposer onSend={onSend} />);
      await type('  Hola a tothom \n');

      await fireEvent.press(sendButton());

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith('Hola a tothom');
    });

    it('empties the field once it is sent', async () => {
      await render(<MessageComposer onSend={jest.fn().mockResolvedValue(undefined)} />);
      await type('Hola');

      await fireEvent.press(sendButton());

      await waitFor(() => expect(field().props.value).toBe(''));
      expect(screen.getByLabelText('0 de 1000 caràcters')).toBeOnTheScreen();
    });

    it('does not send twice while the first one is still on its way', async () => {
      let finish: () => void = () => undefined;
      const onSend = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      await render(<MessageComposer onSend={onSend} />);
      await type('Hola');

      await fireEvent.press(sendButton());
      await fireEvent.press(sendButton());

      expect(onSend).toHaveBeenCalledTimes(1);
      finish();
      await waitFor(() => expect(field().props.value).toBe(''));
    });

    it('does not send twice when two taps land before the screen updates', async () => {
      const onSend = jest.fn(() => new Promise<void>(() => undefined));
      await render(<MessageComposer onSend={onSend} />);
      await type('Hola');
      const button = sendButton();

      // Both activations reach the button in the same frame: it is not disabled yet.
      await act(async () => {
        button.props.onClick({});
        button.props.onClick({});
      });

      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('is busy and cannot send again while its message is on its way', async () => {
      await render(<MessageComposer onSend={() => new Promise<void>(() => undefined)} />);
      await type('Hola');

      await fireEvent.press(sendButton());

      expect(sendButton().props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    });

    it('can send the next message once the first one went through', async () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      await render(<MessageComposer onSend={onSend} />);
      await type('Primer');
      await fireEvent.press(sendButton());
      await waitFor(() => expect(field().props.value).toBe(''));

      await type('Segon');
      await fireEvent.press(sendButton());

      expect(onSend).toHaveBeenNthCalledWith(2, 'Segon');
    });

    it('is busy while the parent says so, and cannot send', async () => {
      const onSend = jest.fn();
      await render(<MessageComposer onSend={onSend} busy />);
      await type('Hola');

      expect(sendButton().props.accessibilityState).toMatchObject({ busy: true, disabled: true });
      await fireEvent.press(sendButton());
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe('when it cannot send', () => {
    it('says why and blocks sending, but lets the person keep writing', async () => {
      const onSend = jest.fn();
      await render(<MessageComposer onSend={onSend} disabledReason="Sense connexió" />);

      await type('Hola');

      expect(screen.getByText('Sense connexió')).toBeOnTheScreen();
      expect(field().props.value).toBe('Hola');
      expect(sendButton().props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(sendButton());
      expect(onSend).not.toHaveBeenCalled();
    });

    it('says nothing and has no live region while it can send', async () => {
      await render(<MessageComposer onSend={jest.fn()} />);

      expect(JSON.stringify(screen.toJSON())).not.toContain('accessibilityLiveRegion');
    });
  });

  it('the send button is a comfortable touch target (WCAG 2.5.8)', async () => {
    await render(<MessageComposer onSend={jest.fn()} />);

    expect(StyleSheet.flatten(sendButton().props.style).minHeight).toBeGreaterThanOrEqual(48);
  });
});
