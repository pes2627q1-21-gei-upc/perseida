import type { Icon } from 'phosphor-react-native';
import {
  CalendarStarIcon,
  FlameIcon,
  GameControllerIcon,
  QuestionIcon,
  UsersThreeIcon,
} from 'phosphor-react-native';

import type { AchievementCategory } from '../api/getMyAchievements';

/**
 * Provisional icon of each category, until the achievements have their own (TG-57, TG-59).
 * Shared by the progress cards, the trophies and the dialog.
 */
export const CATEGORY_ICONS: Record<AchievementCategory, Icon> = {
  streaks: FlameIcon,
  quiz: QuestionIcon,
  events: CalendarStarIcon,
  social: UsersThreeIcon,
  minigame: GameControllerIcon,
};
