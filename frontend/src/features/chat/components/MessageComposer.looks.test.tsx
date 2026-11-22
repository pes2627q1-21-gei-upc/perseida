import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '../../../shared/theme';
import { MessageComposer } from './MessageComposer';

const { state, text, focusRing } = colors.dia;

function counter() {
  return StyleSheet.flatten(screen.getByText(/^\d+\/1000$/).props.style);
}
function field() {
  return screen.getByLabelText('Escriu un missatge');
}

// What the state of the composer changes on screen besides the texts (TG-469): over the limit the
// counter turns to the danger colour as well as saying it, and the field shows a focus ring.
describe('MessageComposer, how its state shows (TG-469)', () => {
  it('the counter is quiet under the limit and in the danger colour over it', async () => {
    await render(<MessageComposer onSend={jest.fn()} />);
    expect(counter().color).toBe(text.secondary);

    await fireEvent.changeText(field(), 'a'.repeat(1001));

    expect(counter().color).toBe(state.danger);
  });

  it('the field shows a focus ring only while it has the focus (WCAG 2.4.7)', async () => {
    await render(<MessageComposer onSend={jest.fn()} />);
    expect(StyleSheet.flatten(field().props.style).boxShadow).toBeUndefined();

    await fireEvent(field(), 'focus');
    expect(StyleSheet.flatten(field().props.style).boxShadow).toContain(focusRing);

    await fireEvent(field(), 'blur');
    expect(StyleSheet.flatten(field().props.style).boxShadow).toBeUndefined();
  });
});
