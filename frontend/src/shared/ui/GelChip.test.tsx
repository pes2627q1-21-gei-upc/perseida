import { fireEvent, render, screen } from '@testing-library/react-native';

import { touch } from '../theme/layout';
import { GelChip } from './GelChip';
import * as ui from './index';

describe('GelChip (TG-51, criterion 9)', () => {
  it('is a checkbox named by its label', async () => {
    await render(<GelChip label="Lluna" selected={false} onPress={jest.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Lluna' })).toBeTruthy();
    expect(screen.getByText('Lluna')).toBeTruthy();
  });

  it('announces whether it is selected', async () => {
    const { rerender } = await render(
      <GelChip label="Lluna" selected={false} onPress={jest.fn()} />,
    );
    expect(screen.getByRole('checkbox', { name: 'Lluna', checked: false })).toBeTruthy();

    await rerender(<GelChip label="Lluna" selected onPress={jest.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Lluna', checked: true })).toBeTruthy();
  });

  it('reports the press', async () => {
    const onPress = jest.fn();
    await render(<GelChip label="Lluna" selected={false} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Lluna' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has a touch target of at least touch.min', async () => {
    await render(<GelChip label="Lluna" selected={false} onPress={jest.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Lluna' })).toHaveStyle({ minHeight: touch.min });
  });

  it('can be found by its test id', async () => {
    await render(
      <GelChip label="Lluna" selected={false} onPress={jest.fn()} testID="chip-lunar" />,
    );

    expect(screen.getByTestId('chip-lunar')).toBeTruthy();
  });

  it('is exported by the shared UI kit', () => {
    expect(ui.GelChip).toBe(GelChip);
  });
});
