import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { GelIconButton } from './GelIconButton';

const LABEL = 'Envia';
const icon = <Text testID="icon">icona</Text>;

describe('GelIconButton (TG-469)', () => {
  it('is a button named by its label, not by its icon (WCAG 1.1.1, 4.1.2)', async () => {
    await render(<GelIconButton label={LABEL} icon={icon} onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: LABEL })).toBeOnTheScreen();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<GelIconButton label={LABEL} icon={icon} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: LABEL }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('when disabled, says so and ignores taps', async () => {
    const onPress = jest.fn();
    await render(<GelIconButton label={LABEL} icon={icon} onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: LABEL });

    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('while busy, is announced as busy, shows a spinner instead of the icon and ignores taps', async () => {
    const onPress = jest.fn();
    await render(<GelIconButton label={LABEL} icon={icon} onPress={onPress} busy />);
    const button = screen.getByRole('button', { name: LABEL });

    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(screen.queryByTestId('icon')).not.toBeOnTheScreen();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is a round, comfortable touch target (WCAG 2.5.8)', async () => {
    await render(<GelIconButton label={LABEL} icon={icon} onPress={jest.fn()} />);

    const style = StyleSheet.flatten(screen.getByRole('button', { name: LABEL }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.width).toBe(style.minHeight);
  });
});
