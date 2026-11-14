import type { TFunction } from 'i18next';

import type { AstronomicalEvent } from './api/getEvents';
import type { ClassifiedEvent } from './classifyEvents';

type When = Pick<AstronomicalEvent, 'starts_at' | 'ends_at'>;

function dayKey(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone }).format(date);
}

/**
 * When an event happens, in the language of the app and the time zone of the device:
 * one date and time if it is instantaneous, the end time only if it ends the same day, and
 * both dates if it lasts longer. `timeZone` is only for tests.
 */
export function formatEventWhen({ starts_at, ends_at }: When, locale: string, timeZone?: string) {
  const full = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
  const start = new Date(starts_at);
  const end = new Date(ends_at);
  if (start.getTime() === end.getTime()) return full.format(start);
  if (dayKey(start, timeZone) === dayKey(end, timeZone)) {
    const hour = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone });
    return `${full.format(start)} – ${hour.format(end)}`;
  }
  return `${full.format(start)} – ${full.format(end)}`;
}

/** One date and time, in the language of the app and the time zone of the device. */
export function formatEventDateTime(iso: string, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

/**
 * Where an event can be seen. The API only gives coordinates (no place name yet), shown with
 * their hemisphere; `null` means it can be seen from anywhere.
 */
export function formatEventWhere(
  location: AstronomicalEvent['location'],
  t: TFunction,
  locale: string,
) {
  if (!location) return t('events.location.anywhere');
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const { latitude, longitude } = location;
  return t('events.location.coordinates', {
    latitude: t(latitude < 0 ? 'events.location.south' : 'events.location.north', {
      value: number.format(Math.abs(latitude)),
    }),
    longitude: t(longitude < 0 ? 'events.location.west' : 'events.location.east', {
      value: number.format(Math.abs(longitude)),
    }),
  });
}

/** Name of an event for screen readers: title, category and, if so, that it is happening now. */
export function describeEvent(event: ClassifiedEvent, t: TFunction) {
  const parts = [event.title, t(`events.category.${event.category}`)];
  if (event.status === 'active') parts.push(t('events.status.active'));
  return parts.join(', ');
}
