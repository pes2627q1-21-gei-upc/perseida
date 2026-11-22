import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { utcDay } from '../classifyEvents';

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

/** Predefined date ranges of the events list, in days from today (TG-51). */
export type SearchRange = 7 | 30 | 90;

/** Filters of the events list. No category means all of them; `near` is the device position. */
export interface EventSearchFilters {
  categories: EventCategory[];
  range: SearchRange;
  near: { latitude: number; longitude: number } | null;
}

/** From today to `range` days later, as UTC days (YYYY-MM-DD), like the API counts them. */
export function searchRange(range: SearchRange, now: Date = new Date()) {
  const to = new Date(now.getTime());
  to.setUTCDate(to.getUTCDate() + range);
  return { from: utcDay(now), to: utcDay(to) };
}

/** Events of the filters. Without `radius_km`: the backend sets the radius of «Near me». */
export async function searchEvents(
  filters: EventSearchFilters,
  now: Date = new Date(),
): Promise<AstronomicalEvent[]> {
  const { from, to } = searchRange(filters.range, now);
  const { data, response } = await api.GET('/api/events', {
    params: {
      query: {
        from,
        to,
        category: filters.categories.length > 0 ? filters.categories : undefined,
        lat: filters.near?.latitude,
        lon: filters.near?.longitude,
      },
    },
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}
