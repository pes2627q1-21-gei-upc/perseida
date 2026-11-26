import * as SecureStore from 'expo-secure-store';

import { isLanguage, type Language } from '../../shared/i18n';

// Not a secret: SecureStore is only used because it is already in the app (ADR-0013) and
// there is no storage for plain data. The web has its own file (languageStorage.web.ts).
const LANGUAGE_KEY = 'perseida.language';

export async function saveLanguage(language: Language): Promise<void> {
  try {
    await SecureStore.setItemAsync(LANGUAGE_KEY, language);
  } catch {
    // The device cannot save it: the language still applies and the account still gets it.
  }
}

/** The language last saved on this device, or null if there is none or it cannot be read. */
export async function getSavedLanguage(): Promise<Language | null> {
  try {
    const value = await SecureStore.getItemAsync(LANGUAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}
