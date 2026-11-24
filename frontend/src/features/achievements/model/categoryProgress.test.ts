import { achievement, mockAchievements } from '../../../../__mocks__/achievements';
import { ACHIEVEMENT_CATEGORIES, categoryProgress } from './categoryProgress';

describe('categoryProgress (TG-57 criteria 1 and 2)', () => {
  it('gives one entry per category, in the fixed order, even when the API sends none of it', () => {
    const entries = categoryProgress([]);

    expect(entries.map((entry) => entry.category)).toEqual([
      'streaks',
      'quiz',
      'events',
      'social',
      'minigame',
    ]);
    expect(ACHIEVEMENT_CATEGORIES).toHaveLength(5);
    expect(entries.every((entry) => entry.achievement === null && !entry.completed)).toBe(true);
  });

  it('picks the first achievement not unlocked of each category, by position', () => {
    const byCategory = Object.fromEntries(
      categoryProgress(mockAchievements).map((entry) => [entry.category, entry]),
    );

    expect(byCategory.streaks).toMatchObject({
      completed: false,
      achievement: { code: 'lluna_plena', current: 8, goal: 14 },
    });
    expect(byCategory.quiz.achievement?.code).toBe('telescopi_nou');
    expect(byCategory.social.achievement?.code).toBe('satellit');
  });

  it('does not trust the order of the response: it sorts by position', () => {
    const shuffled = [
      achievement({ code: 'cicle_lunar', position: 4, goal: 30 }),
      achievement({ code: 'lluna_plena', position: 3, goal: 14 }),
    ];

    const [streaks] = categoryProgress(shuffled);

    expect(streaks.achievement?.code).toBe('lluna_plena');
  });

  it('when every achievement of the category is unlocked, keeps the last one and marks it completed', () => {
    const events = categoryProgress(mockAchievements).find((entry) => entry.category === 'events');

    expect(events).toMatchObject({
      completed: true,
      achievement: { code: 'cacador_d_eclipsis', unlocked: true },
    });
  });

  it('ignores a category the app does not know yet', () => {
    const unknown = achievement({
      code: 'nova',
      category: 'astrophoto' as unknown as 'streaks',
    });

    expect(categoryProgress([unknown]).map((entry) => entry.achievement)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
