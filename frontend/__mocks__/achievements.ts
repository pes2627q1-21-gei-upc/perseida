import type { components } from '../src/shared/api/schema';

export type Achievement = components['schemas']['AchievementResponse'];

/** One achievement of the catalogue with the progress of the user (TG-58 response). */
export function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    code: 'primera_llum',
    name: 'Primera llum',
    description: "Entra a l'app un dia i obre la imatge astronòmica del dia.",
    category: 'streaks',
    position: 1,
    current: 0,
    goal: 1,
    unlocked: false,
    unlocked_at: null,
    ...overrides,
  };
}

/**
 * A short catalogue with every category, in the order of the API (category, then position):
 * streaks half way, quiz just started, events all done, social at 0 and minigame at 0.
 */
export const mockAchievements: Achievement[] = [
  achievement({
    code: 'primera_llum',
    current: 1,
    goal: 1,
    unlocked: true,
    unlocked_at: '2026-11-10T08:00:00Z',
  }),
  achievement({
    code: 'orbita_setmanal',
    name: 'Òrbita setmanal',
    position: 2,
    current: 7,
    goal: 7,
    unlocked: true,
    unlocked_at: '2026-11-16T08:00:00Z',
  }),
  achievement({ code: 'lluna_plena', name: 'Lluna plena', position: 3, current: 8, goal: 14 }),
  achievement({ code: 'cicle_lunar', name: 'Cicle lunar', position: 4, current: 8, goal: 30 }),
  achievement({
    code: 'telescopi_nou',
    name: 'Telescopi nou',
    category: 'quiz',
    position: 1,
    current: 0,
    goal: 1,
  }),
  achievement({
    code: 'primera_alineacio',
    name: 'Primera alineació',
    category: 'events',
    position: 1,
    current: 1,
    goal: 1,
    unlocked: true,
    unlocked_at: '2026-11-12T08:00:00Z',
  }),
  achievement({
    code: 'cacador_d_eclipsis',
    name: "Caçador d'eclipsis",
    category: 'events',
    position: 2,
    current: 10,
    goal: 10,
    unlocked: true,
    unlocked_at: '2026-11-20T08:00:00Z',
  }),
  achievement({ code: 'satellit', name: 'Satèl·lit', category: 'social', position: 1, goal: 1 }),
  achievement({
    code: 'llancament',
    name: 'Llançament',
    category: 'minigame',
    position: 1,
    goal: 1,
  }),
];
