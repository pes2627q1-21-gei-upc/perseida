import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MessageComposer } from './MessageComposer';

describe('MessageComposer typing signal (TG-65)', () => {
  it('signals typing while text is present and stops when the field is cleared', async () => {
    const onTyping = jest.fn();
    await render(<MessageComposer onSend={jest.fn()} onTyping={onTyping} />);
    await fireEvent.changeText(screen.getByLabelText('Escriu un missatge'), 'Hola');
    expect(onTyping).toHaveBeenLastCalledWith(true);
    await fireEvent.changeText(screen.getByLabelText('Escriu un missatge'), '');
    expect(onTyping).toHaveBeenLastCalledWith(false);
  });

  it('signals stopped typing after a message is sent and the field clears', async () => {
    const onTyping = jest.fn();
    await render(
      <MessageComposer onSend={jest.fn().mockResolvedValue(undefined)} onTyping={onTyping} />,
    );
    await fireEvent.changeText(screen.getByLabelText('Escriu un missatge'), 'Hola');
    await fireEvent.press(screen.getByRole('button', { name: 'Envia' }));
    await waitFor(() => expect(onTyping).toHaveBeenLastCalledWith(false));
  });
});
