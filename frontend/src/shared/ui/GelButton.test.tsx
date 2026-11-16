import { fireEvent, render, screen } from '@testing-library/react-native';

import { GelButton } from './GelButton';

describe('GelButton', () => {
  it('is a button reachable by role and name', async () => {
    await render(<GelButton label="Continua amb Google" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Continua amb Google' })).toBeOnTheScreen();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<GelButton label="Continua amb Google" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Continua amb Google' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is busy and disabled, and ignores taps while an action is in progress (WCAG 4.1.2)', async () => {
    const onPress = jest.fn();
    await render(<GelButton label="Continua amb Google" onPress={onPress} busy />);
    const button = screen.getByRole('button', { name: 'Continua amb Google', busy: true });

    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });

    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
  });

  it('ignores taps when explicitly disabled', async () => {
    const onPress = jest.fn();
    await render(<GelButton label="Continua amb Google" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Continua amb Google' });

    expect(button.props.accessibilityState).toEqual({ busy: false, disabled: true });

    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the decorative icon before the label', async () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    await render(
      <GelButton
        label="Continua amb Google"
        onPress={jest.fn()}
        icon={<Text testID="test-icon">G</Text>}
      />,
    );

    expect(screen.getByTestId('test-icon')).toBeOnTheScreen();
  });
});
