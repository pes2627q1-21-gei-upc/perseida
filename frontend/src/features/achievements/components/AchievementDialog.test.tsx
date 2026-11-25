import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { achievement } from '../../../../__mocks__/achievements';
import { AppError } from '../../../shared/errors';
import i18n from '../../../shared/i18n';
import { shareAchievement } from '../share/shareAchievement';
import { AchievementDialog } from './AchievementDialog';

jest.mock('../share/shareAchievement');

const shareMock = jest.mocked(shareAchievement);

const unlocked = achievement({
  code: 'primera_llum',
  current: 1,
  goal: 1,
  unlocked: true,
  unlocked_at: '2026-11-10T08:00:00Z',
});
const other = achievement({
  code: 'orbita_setmanal',
  name: 'Òrbita setmanal',
  description: 'Set dies seguits.',
  unlocked: true,
});

async function renderDialog(shown: typeof unlocked | null = unlocked) {
  const onClose = jest.fn();
  const view = await render(<AchievementDialog achievement={shown} onClose={onClose} />);
  return { onClose, ...view };
}

beforeEach(() => {
  shareMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  shareMock.mockReset();
  await act(async () => {
    await i18n.changeLanguage('ca');
  });
});

describe('AchievementDialog (TG-59 #578)', () => {
  it('shows the title and the description of the achievement', async () => {
    await renderDialog();

    expect(screen.getByRole('header', { name: 'Primera llum' })).toBeOnTheScreen();
    expect(
      screen.getByText("Entra a l'app un dia i obre la imatge astronòmica del dia."),
    ).toBeOnTheScreen();
  });

  it('criterion 7: the description is translated by code when the app has the text', async () => {
    i18n.addResource(
      'es',
      'translation',
      'achievements.descriptions.primera_llum',
      'Entra un día.',
    );
    await act(async () => {
      await i18n.changeLanguage('es');
    });

    await renderDialog();

    expect(screen.getByText('Entra un día.')).toBeOnTheScreen();
    i18n.removeResourceBundle('es', 'translation');
  });

  it('criterion 7: the window follows the language of the app, with the text of the app', async () => {
    const { rerender, onClose } = await renderDialog(other);
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    await rerender(<AchievementDialog achievement={other} onClose={onClose} />);

    expect(screen.getByRole('header', { name: 'Weekly orbit' })).toBeOnTheScreen();
    expect(screen.getByText('Keep your streak going for 7 days in a row.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Share' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it('an achievement the app does not know yet shows the description the server sends', async () => {
    await renderDialog(
      achievement({
        code: 'nova_fita',
        name: 'Nova fita',
        description: 'Una fita nova.',
        unlocked: true,
      }),
    );

    expect(screen.getByRole('header', { name: 'Nova fita' })).toBeOnTheScreen();
    expect(screen.getByText('Una fita nova.')).toBeOnTheScreen();
  });

  it('the share button is busy while the menu is open and free again afterwards', async () => {
    let finish!: () => void;
    shareMock.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    await renderDialog();
    const busy = (value: boolean) =>
      expect(screen.getByRole('button', { name: 'Compartir' })).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ busy: value }),
      );
    busy(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));
    busy(true);
    await act(async () => finish());

    await waitFor(() => busy(false));
  });

  it('the share button is free again after a failure, so it can be tried once more', async () => {
    shareMock.mockRejectedValue(
      new AppError({ kind: 'network', code: 'SHARE_FAILED', retryable: false }),
    );
    await renderDialog();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Compartir' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ busy: false }),
    );
  });

  it('the error is announced once, as an alert, without a second live region', async () => {
    shareMock.mockRejectedValue(
      new AppError({ kind: 'network', code: 'SHARE_FAILED', retryable: false }),
    );
    await renderDialog();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));

    expect(await screen.findByRole('alert')).not.toHaveProp('accessibilityLiveRegion');
  });

  it('the window is closed while there is no achievement', async () => {
    await renderDialog(null);

    expect(screen.queryByTestId('achievement-dialog-modal')).not.toBeOnTheScreen();
  });

  it('shows nothing without an achievement', async () => {
    await renderDialog(null);

    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
    expect(screen.queryByText('Tancar')).not.toBeOnTheScreen();
  });

  it('criterion 5: «Compartir» shares the achievement with its translated name', async () => {
    await renderDialog();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));

    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(shareMock).toHaveBeenCalledWith('Primera llum', expect.any(Function));
  });

  it('criterion 8: the share button says which achievement it shares', async () => {
    await renderDialog();

    expect(screen.getByRole('button', { name: 'Compartir' })).toHaveProp(
      'accessibilityHint',
      'Comparteix la fita "Primera llum"',
    );
  });

  it('criterion 6: closing the share menu without sending shows no error', async () => {
    shareMock.mockResolvedValue(undefined);
    await renderDialog();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('a real failure of the share menu is explained inside the dialog', async () => {
    shareMock.mockRejectedValue(
      new AppError({ kind: 'network', code: 'SHARE_FAILED', retryable: false }),
    );
    await renderDialog();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "No s'ha pogut obrir el menú de compartir. Torna-ho a provar.",
    );
  });

  it('the error of an achievement does not follow the next one that is opened', async () => {
    shareMock.mockRejectedValue(
      new AppError({ kind: 'network', code: 'SHARE_FAILED', retryable: false }),
    );
    const { rerender, onClose } = await renderDialog();
    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));
    await screen.findByRole('alert');

    await rerender(<AchievementDialog achievement={other} onClose={onClose} />);

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Òrbita setmanal' })).toBeOnTheScreen();
  });

  it('«Tancar» closes the dialog', async () => {
    const { onClose } = await renderDialog();

    await fireEvent.press(screen.getByRole('button', { name: 'Tancar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with the back button of the system or Escape on the web', async () => {
    const { onClose } = await renderDialog();

    await fireEvent(screen.getByTestId('achievement-dialog-modal'), 'requestClose');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
