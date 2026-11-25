import { act, fireEvent, render, screen } from '@testing-library/react-native';

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
  jest.resetAllMocks();
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
