import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ca from '../../../locales/ca.json';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';
import { DEFAULT_LANGUAGE, detectLanguage, SUPPORTED_LANGUAGES } from './detectLanguage';

export { DEFAULT_LANGUAGE, detectLanguage, SUPPORTED_LANGUAGES } from './detectLanguage';
export type { Language } from './detectLanguage';

// The texts are bundled, so init is synchronous and t() never runs before they are loaded.
void i18n.use(initReactI18next).init({
  resources: { ca: { translation: ca }, es: { translation: es }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  initAsync: false,
  interpolation: { escapeValue: false },
});

export default i18n;
