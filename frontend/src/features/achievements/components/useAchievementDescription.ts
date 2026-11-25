import { useTranslation } from 'react-i18next';

import type { Achievement } from '../api/getMyAchievements';

/**
 * The description of an achievement in the language of the app. Like the name, the server only
 * has it in Catalan, so the app translates it by its stable `code`; one the app does not know yet
 * shows the description of the server.
 */
export function useAchievementDescription() {
  const { t, i18n } = useTranslation();
  return (achievement: Pick<Achievement, 'code' | 'description'>): string => {
    const key = `achievements.descriptions.${achievement.code}`;
    return i18n.exists(key) ? t(key) : achievement.description;
  };
}
