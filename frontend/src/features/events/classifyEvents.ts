import type { AstronomicalEvent } from './api/getEvents';

export type EventStatus = 'active' | 'upcoming';
/** `outings` has no events: the map joins the outings, which come from their own hook. */
export type EventFilter = EventStatus | 'all' | 'outings';

export type ClassifiedEvent = AstronomicalEvent & { status: EventStatus };

export interface ClassifiedEvents {
  active: ClassifiedEvent[];
  /** Upcoming events that are not active already. */
  upcoming: ClassifiedEvent[];
  /** Union of both by id, ordered by start and then by id (like the API). */
  all: ClassifiedEvent[];
}

function byStartThenId(a: ClassifiedEvent, b: ClassifiedEvent): number {
  if (a.starts_at !== b.starts_at) return a.starts_at < b.starts_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Splits the events of the map (TG-52). An event in both lists counts as active. Events
 * without a location are kept: turning events into markers is up to the map.
 */
export function classifyEvents(
  active: readonly AstronomicalEvent[],
  upcoming: readonly AstronomicalEvent[],
): ClassifiedEvents {
  const activeIds = new Set(active.map((event) => event.id));
  const activeEvents = active.map((event) => ({ ...event, status: 'active' as const }));
  const upcomingEvents = upcoming
    .filter((event) => !activeIds.has(event.id))
    .map((event) => ({ ...event, status: 'upcoming' as const }));
  return {
    active: activeEvents,
    upcoming: upcomingEvents,
    all: [...activeEvents, ...upcomingEvents].sort(byStartThenId),
  };
}

const NO_EVENTS: ClassifiedEvent[] = [];

/** The list the map shows for a filter. */
export function filterEvents(events: ClassifiedEvents, filter: EventFilter): ClassifiedEvent[] {
  return filter === 'outings' ? NO_EVENTS : events[filter];
}
