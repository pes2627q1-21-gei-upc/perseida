import { getLocales } from 'expo-localization';

export const SUPPORTED_LANGUAGES = ['ca', 'es', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'ca';

function isSupported(code: string | null): code is Language {
  return SUPPORTED_LANGUAGES.some((language) => language === code);
}

/** First supported language in the device's preference order, or Catalan if none is. */
export function detectLanguage(): Language {
  for (const { languageCode } of getLocales()) {
    if (isSupported(languageCode)) return languageCode;
  }
  return DEFAULT_LANGUAGE;
}
