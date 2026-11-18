import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConfirmDialog } from './ConfirmDialog';

async function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await render(
    <ConfirmDialog
      visible
      title="Vols esborrar aquesta sortida?"
      message="No es pot desfer."
      confirmLabel="Esborra"
      cancelLabel="Cancel·la"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('shows nothing while it is not visible', async () => {
    await renderDialog({ visible: false });

    expect(screen.queryByText('Vols esborrar aquesta sortida?')).toBeNull();
  });

  it('shows the question as a header, the message and both buttons', async () => {
    await renderDialog();

    expect(
      screen.getByRole('header', { name: 'Vols esborrar aquesta sortida?' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('No es pot desfer.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Esborra' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel·la' })).toBeOnTheScreen();
  });

  it('is announced as a modal, so the screen behind is left alone', async () => {
    await renderDialog();

    expect(screen.getByTestId('confirm-dialog').props.accessibilityViewIsModal).toBe(true);
  });

  it('confirms with the confirm button and does not cancel', async () => {
    const { onConfirm, onCancel } = await renderDialog();

    await fireEvent.press(screen.getByRole('button', { name: 'Esborra' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels with the cancel button and does not confirm', async () => {
    const { onConfirm, onCancel } = await renderDialog();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel·la' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels with the back button of the system or Escape on the web', async () => {
    const { onConfirm, onCancel } = await renderDialog();

    fireEvent(screen.getByTestId('confirm-dialog-modal'), 'requestClose');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is busy while the action runs and ignores new taps', async () => {
    const { onConfirm } = await renderDialog({ busy: true });

    const confirm = screen.getByRole('button', { name: 'Esborra' });
    expect(confirm.props.accessibilityState.busy).toBe(true);
    await fireEvent.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is not busy by default', async () => {
    await renderDialog();

    expect(screen.getByRole('button', { name: 'Esborra' }).props.accessibilityState.busy).toBe(
      false,
    );
  });
});
