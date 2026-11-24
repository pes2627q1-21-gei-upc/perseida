import type { Achievement, AchievementCategory } from '../api/getMyAchievements';

/** The categories of achievements, in the order the profile shows them (TG-57 criterion 1). */
export const ACHIEVEMENT_CATEGORIES: readonly AchievementCategory[] = [
  'streaks',
  'quiz',
  'events',
  'social',
  'minigame',
];

export interface CategoryProgress {
  category: AchievementCategory;
  /**
   * The achievement the user is going for: the first one not unlocked, by position. When the
   * whole category is done, its last one. Null if the catalogue has none of this category.
   */
  achievement: Achievement | null;
  /** Every achievement of the category is unlocked. */
  completed: boolean;
}

/** One entry per category, each with the achievement to show on its card (TG-57 criterion 2). */
export function categoryProgress(achievements: readonly Achievement[]): CategoryProgress[] {
  return ACHIEVEMENT_CATEGORIES.map((category) => {
    const ofCategory = achievements
      .filter((item) => item.category === category)
      .sort((a, b) => a.position - b.position);
    const next = ofCategory.find((item) => !item.unlocked);
    if (next) return { category, achievement: next, completed: false };
    const last = ofCategory.at(-1) ?? null;
    return { category, achievement: last, completed: last !== null };
  });
}
