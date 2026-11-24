import type { TFunction } from 'i18next';
import { Share } from 'react-native';

import { AppError } from '../../../shared/errors';

/**
 * Opens the share menu of the device with the text of an unlocked achievement, in the language
 * of the app (`t`). Closing the menu without sending is not an error: the system answers
 * `dismissedAction` on iOS and Android and the browser rejects with an `AbortError`. Any other
 * failure becomes an AppError, never the technical text of the system.
 */
export async function shareAchievement(name: string, t: TFunction): Promise<void> {
  try {
    await Share.share({ message: t('achievements.shareText', { name }) });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    throw new AppError({ kind: 'network', code: 'SHARE_FAILED', retryable: false });
  }
}
