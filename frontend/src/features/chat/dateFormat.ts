const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * An Intl.DateTimeFormat made once per language and options (time zone included) and kept: a
 * room formats one date per bubble and per day, and building a formatter is costly (TG-469).
 */
export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}
