import { useTranslation } from 'react-i18next';

import type { Achievement } from '../api/getMyAchievements';

/**
 * The name of an achievement in the language of the app. The catalogue of the server only has
 * the Catalan name, so the app translates it by its stable `code`; an achievement the app does
 * not know yet (added on the server later) shows the name of the server.
 */
export function useAchievementName() {
  const { t, i18n } = useTranslation();
  return (achievement: Pick<Achievement, 'code' | 'name'>): string => {
    const key = `achievements.names.${achievement.code}`;
    return i18n.exists(key) ? t(key) : achievement.name;
  };
}
