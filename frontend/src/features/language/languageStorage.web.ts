import { isLanguage, type Language } from '../../shared/i18n';

// expo-secure-store does not exist on the web: the language lives in localStorage. It is not
// a secret, and it must outlive the tab (unlike the tokens of tokenStorage.web.ts).
const LANGUAGE_KEY = 'perseida.language';

export async function saveLanguage(language: Language): Promise<void> {
  try {
    globalThis.localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Blocked or full storage: the language still applies in this session.
  }
}

/** The language last saved in this browser, or null if there is none or it cannot be read. */
export async function getSavedLanguage(): Promise<Language | null> {
  try {
    const value = globalThis.localStorage.getItem(LANGUAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}
