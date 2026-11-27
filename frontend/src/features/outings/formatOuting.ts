import type { TFunction } from 'i18next';

import type { Outing } from './api/outings';

/** One date and time, in the language of the app and the time zone of the device. */
export function formatDateTime(value: Date | string, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

/** A latitude or longitude with four decimals (about 11 m), in the language of the app. */
export function formatCoordinate(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

/** Name of an outing for screen readers: title, "Outing" and its date. */
export function describeOuting(outing: Outing, t: TFunction, locale: string, timeZone?: string) {
  return [
    outing.title,
    t('events.outings.kind'),
    formatDateTime(outing.starts_at, locale, timeZone),
  ].join(', ');
}
