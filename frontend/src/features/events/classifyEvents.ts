import type { AstronomicalEvent } from './api/getEvents';

export type EventStatus = 'active' | 'upcoming';
/** `outings` has no events: the map joins the outings, which come from their own hook. */
export type EventFilter = EventStatus | 'all' | 'outings';

export type ClassifiedEvent = AstronomicalEvent & { status: EventStatus };

/** Day of a date in UTC, as YYYY-MM-DD: the days of the API are UTC days. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether an event is active on the UTC day of `now`, like GET /api/events/active: under way
 * at some moment from 00:00Z to 24:00Z, an event that ends just at 00:00Z included.
 */
export function statusOn(
  { starts_at, ends_at }: Pick<AstronomicalEvent, 'starts_at' | 'ends_at'>,
  now: Date,
): EventStatus {
  const dayStart = Date.parse(`${utcDay(now)}T00:00:00Z`);
  const active = Date.parse(starts_at) < dayStart + DAY_MS && Date.parse(ends_at) >= dayStart;
  return active ? 'active' : 'upcoming';
}

export interface ClassifiedEvents {
  active: ClassifiedEvent[];
  /** Upcoming events that are not active already. */
  upcoming: ClassifiedEvent[];
  /** Union of both by id, ordered by start and then by id (like the API). */
  all: ClassifiedEvent[];
}

type Sortable = Pick<AstronomicalEvent, 'id' | 'starts_at'>;

/** Order of the API: by start and then by id. */
export function byStartThenId(a: Sortable, b: Sortable): number {
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
