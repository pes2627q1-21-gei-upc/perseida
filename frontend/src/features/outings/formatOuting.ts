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
