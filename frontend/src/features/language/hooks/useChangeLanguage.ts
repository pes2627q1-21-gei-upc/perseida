import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import i18n, { type Language } from '../../../shared/i18n';
import { profileKeys, type UserProfile } from '../../profile';
import { updateLanguage } from '../api/updateLanguage';
import { saveLanguage } from '../languageStorage';

/**
 * Changes the language of the app (TG-92). The texts change at once; then the language is
 * saved on the device and in the account. If the account cannot be reached the screen keeps
 * the new language: `error` says so and `retry` sends the last chosen language again.
 */
export function useChangeLanguage() {
  const queryClient = useQueryClient();
  const mutation = useMutation<UserProfile, AppError, Language>({
    mutationFn: async (language) => {
      await saveLanguage(language);
      return updateLanguage(language);
    },
    onSuccess: (profile) => queryClient.setQueryData(profileKeys.me(), profile),
  });

  return {
    change: (language: Language) => {
      void i18n.changeLanguage(language);
      mutation.mutate(language);
    },
    retry: () => {
      if (mutation.variables) mutation.mutate(mutation.variables);
    },
    isSaving: mutation.isPending,
    error: mutation.error,
  };
}
