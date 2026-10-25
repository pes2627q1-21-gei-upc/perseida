export type SupportedLanguage = 'ca' | 'es' | 'en';

export const DEFAULT_LANGUAGE: SupportedLanguage = 'ca';

/**
 * Detects the preferred language from the runtime environment or device locale.
 * Slices the language tag (e.g. 'ca-ES' -> 'ca', 'es-419' -> 'es', 'en-US' -> 'en').
 * Returns 'ca', 'es', or 'en', falling back to 'ca' (ADR-0008, US #43 criterion 6).
 */
export function getDeviceLanguage(): SupportedLanguage {
  try {
    const locale =
      Intl.DateTimeFormat().resolvedOptions().locale ||
      (typeof navigator !== 'undefined' ? navigator.language : '');

    const prefix = locale.split(/[-_]/)[0]?.toLowerCase();
    if (prefix === 'ca' || prefix === 'es' || prefix === 'en') {
      return prefix;
    }
  } catch {
    // If Intl is unavailable, fallback safely.
  }
  return DEFAULT_LANGUAGE;
}
