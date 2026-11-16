/**
 * Formats the APOD date (YYYY-MM-DD) in the device language, e.g. "18 d'octubre de 2026".
 * The date has no time, so it is read and shown in UTC to avoid moving to the previous day.
 */
export function formatApodDate(isoDate: string, locale?: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
