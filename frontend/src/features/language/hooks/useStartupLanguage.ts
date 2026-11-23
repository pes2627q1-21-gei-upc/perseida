import { useEffect } from 'react';

import { queryClient } from '../../../shared/api/queryClient';
import i18n from '../../../shared/i18n';
import { getUserProfile, profileKeys, USER_PROFILE_STALE_TIME_MS } from '../../profile';
import { getSavedLanguage, saveLanguage } from '../languageStorage';

/**
 * Language when the app opens with a session (TG-92 criterion 5). First the last language
 * saved on the device, so it already works offline; then the one of the account, which wins
 * and is saved on the device. Without a session nothing happens: the language of the device
 * stays (criterion 7), and the account language is applied after signing in because the app
 * group is mounted again with `ready`.
 */
export function useStartupLanguage(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let mounted = true;

    async function apply() {
      const saved = await getSavedLanguage();
      if (mounted && saved) await i18n.changeLanguage(saved);
      // If the person chooses a language while the account loads, their choice stands.
      const chosenAtStart = i18n.language;
      try {
        const profile = await queryClient.fetchQuery({
          queryKey: profileKeys.me(),
          queryFn: getUserProfile,
          staleTime: USER_PROFILE_STALE_TIME_MS,
        });
        if (!mounted || i18n.language !== chosenAtStart) return;
        await i18n.changeLanguage(profile.preferred_language);
        await saveLanguage(profile.preferred_language);
      } catch {
        // No connection or the account cannot be read: the saved language stays.
      }
    }

    void apply();
    return () => {
      mounted = false;
    };
  }, [ready]);
}
