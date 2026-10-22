import { fireEvent, render, screen } from '@testing-library/react-native';

import { QuietButton } from './QuietButton';

describe('QuietButton', () => {
  it('is a button reachable by role and name', async () => {
    await render(<QuietButton label="Tanca la sessió" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Tanca la sessió' })).toBeOnTheScreen();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<QuietButton label="Tanca la sessió" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tanca la sessió' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is busy and ignores taps while an action is in progress', async () => {
    const onPress = jest.fn();
    await render(<QuietButton label="Tanca la sessió" onPress={onPress} busy />);
    const button = screen.getByRole('button', { name: 'Tanca la sessió', busy: true });

    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the icon before the label', async () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    await render(
      <QuietButton label="Tanca la sessió" onPress={jest.fn()} icon={<Text>icon</Text>} />,
    );

    expect(screen.getByText('icon')).toBeOnTheScreen();
  });
});
