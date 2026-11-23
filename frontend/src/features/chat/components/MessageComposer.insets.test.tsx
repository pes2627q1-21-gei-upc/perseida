import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { spacing } from '../../../shared/theme';
import { MessageComposer } from './MessageComposer';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 12, bottom: 34, left: 10 },
};

async function renderWithSafeArea(ui: ReactElement) {
  await render(<SafeAreaProvider initialMetrics={SAFE_AREA}>{ui}</SafeAreaProvider>);
}
function frame() {
  return StyleSheet.flatten(screen.getByTestId('chat-composer').props.style);
}

// The screen knows whether the keyboard is up (then there is no home indicator to clear), so it
// says how much room to leave at the bottom; the sides follow the safe area (TG-469).
describe('MessageComposer, room around it (TG-469)', () => {
  it('leaves no bottom safe area of its own: by default only its margin', async () => {
    await renderWithSafeArea(<MessageComposer onSend={jest.fn()} />);

    expect(frame().paddingBottom).toBe(spacing.sm);
  });

  it('leaves the bottom room the screen asks for', async () => {
    await renderWithSafeArea(<MessageComposer onSend={jest.fn()} bottomInset={20} />);

    expect(frame().paddingBottom).toBe(spacing.sm + 20);
  });

  it('keeps clear of the sides of the safe area', async () => {
    await renderWithSafeArea(<MessageComposer onSend={jest.fn()} />);

    expect(frame()).toMatchObject({
      paddingLeft: spacing.sm + SAFE_AREA.insets.left,
      paddingRight: spacing.sm + SAFE_AREA.insets.right,
    });
  });

  it('works without a safe area provider', async () => {
    await render(<MessageComposer onSend={jest.fn()} />);

    expect(frame()).toMatchObject({ paddingLeft: spacing.sm, paddingRight: spacing.sm });
  });
});
