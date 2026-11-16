import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';

export type AstronomicalEvent = components['schemas']['EventResponse'];
export type EventCategory = components['schemas']['EventCategory'];

function invalidResponse(status: number): AppError {
  // 2xx without a body: treat as an unusable response, not as a crash.
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

/** Events that overlap today (UTC). The client middleware already throws AppError on failures. */
export async function getActiveEvents(): Promise<AstronomicalEvent[]> {
  const { data, response } = await api.GET('/api/events/active');
  if (!data) throw invalidResponse(response.status);
  return data;
}

/** Events that start from now until `days` days ahead (1-30). */
export async function getUpcomingEvents(days: number): Promise<AstronomicalEvent[]> {
  const { data, response } = await api.GET('/api/events/upcoming', {
    params: { query: { days } },
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}
