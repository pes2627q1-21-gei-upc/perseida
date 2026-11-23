/**
 * Distance to a meeting point, in the language of the app: whole metres below 1 km, and
 * kilometres with one decimal from 1 km on, the decimal only when it is needed (TG-352).
 */
export function formatDistance(metres: number, locale: string): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(metres / 1000);
  return `${km} km`;
}
