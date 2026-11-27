/** The calendar day of an instant in a time zone, as text, to tell whether two are the same day. */
function dayOf(date: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone }).format(date);
}

/**
 * When a message was sent, as short as a chat list needs: the time if it was today, the date
 * if it was another day. «Today» is the one of the device (`timeZone` is only for tests).
 */
export function formatMessageTime(
  sentAt: string,
  now: Date,
  locale: string,
  timeZone?: string,
): string {
  const sent = new Date(sentAt);
  const sameDay = dayOf(sent, locale, timeZone) === dayOf(now, locale, timeZone);
  const style = sameDay ? { timeStyle: 'short' as const } : { dateStyle: 'short' as const };
  return new Intl.DateTimeFormat(locale, { ...style, timeZone }).format(sent);
}
