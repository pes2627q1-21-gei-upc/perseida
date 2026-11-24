import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { withSession } from '../../auth/api/authorized';

export type Achievement = components['schemas']['AchievementResponse'];
export type AchievementCategory = components['schemas']['AchievementCategory'];

function invalidResponse(status: number): AppError {
  // A 2xx without the list: an unusable response, not a crash.
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

/**
 * The whole catalogue of achievements with the progress of the session user
 * (GET /api/users/me/achievements, TG-58), ordered by category and position.
 * The progress and the goal come from the server: the app only draws them.
 */
export async function getMyAchievements(): Promise<Achievement[]> {
  return withSession(async (headers) => {
    const { data, response } = await api.GET('/api/users/me/achievements', { headers });
    if (!Array.isArray(data)) throw invalidResponse(response.status);
    return data;
  });
}
