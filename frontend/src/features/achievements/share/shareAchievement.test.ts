import i18n from 'i18next';
import { Share } from 'react-native';

import '../../../shared/i18n';
import { AppError } from '../../../shared/errors';
import { shareAchievement } from './shareAchievement';

afterEach(async () => {
  jest.restoreAllMocks();
  await i18n.changeLanguage('ca');
});

describe('shareAchievement (TG-59 #579)', () => {
  it.each([
    ['ca', 'He desbloquejat "7 dies de ratxa" a Perseida!'],
    ['es', '¡He desbloqueado "7 dies de ratxa" en Perseida!'],
    ['en', 'I unlocked "7 dies de ratxa" on Perseida!'],
  ])('opens the share menu with the text in %s', async (language, message) => {
    await i18n.changeLanguage(language);
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });

    await shareAchievement('7 dies de ratxa', i18n.t);

    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ message });
  });

  it('does nothing else once the content is shared', async () => {
    jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });

    await expect(shareAchievement('Lluna plena', i18n.t)).resolves.toBeUndefined();
  });

  it('is not an error when the user closes the menu without sending (iOS and Android)', async () => {
    jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });

    await expect(shareAchievement('Lluna plena', i18n.t)).resolves.toBeUndefined();
  });

  it('is not an error when the user cancels the share of the browser (AbortError)', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    jest.spyOn(Share, 'share').mockRejectedValue(abort);

    await expect(shareAchievement('Lluna plena', i18n.t)).resolves.toBeUndefined();
  });

  it('turns a real failure of the share API into an AppError with a stable code', async () => {
    jest
      .spyOn(Share, 'share')
      .mockRejectedValue(new Error('Share is not supported in this browser'));

    const failure = await shareAchievement('Lluna plena', i18n.t).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: 'network', code: 'SHARE_FAILED', retryable: false });
    // The text of the system error is technical: it never reaches the user.
    expect((failure as AppError).message).toBe('SHARE_FAILED');
  });
});
