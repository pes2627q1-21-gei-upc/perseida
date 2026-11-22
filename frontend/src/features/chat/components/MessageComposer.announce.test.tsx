import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { MessageComposer } from './MessageComposer';

// announceForAccessibility is already a mock in jest-expo: spying on it keeps the calls of the
// previous test, so they are cleared first.
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

// Android reads a live region by itself; iOS needs an explicit announcement (TG-469).
describe('MessageComposer, why it cannot send (TG-469)', () => {
  it('is announced on iOS when it appears', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    expect(Platform.OS).toBe('ios');

    await render(<MessageComposer onSend={jest.fn()} disabledReason="Sense connexió" />);

    expect(announce).toHaveBeenCalledWith('Sense connexió');
  });

  it('announces nothing when there is no reason', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await render(<MessageComposer onSend={jest.fn()} />);

    expect(announce).not.toHaveBeenCalled();
  });
});

describe('MessageComposer, a text over the limit (TG-469)', () => {
  it('is announced on iOS when the alert appears', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(<MessageComposer onSend={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText('Escriu un missatge'), 'a'.repeat(1001));

    expect(announce).toHaveBeenCalledWith(screen.getByRole('alert').props.children);
    expect(announce).toHaveBeenCalledTimes(1);
  });
});
