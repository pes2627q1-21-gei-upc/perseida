import { getLocales } from 'expo-localization';

jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));

const mockedGetLocales = jest.mocked(getLocales);

function setDeviceLanguages(...codes: (string | null)[]) {
  mockedGetLocales.mockReturnValue(codes.map((languageCode) => ({ languageCode })) as never);
}

/** The module initialises i18next on import, so each case loads a fresh copy. */
function loadI18n() {
  let i18n!: typeof import('./index').default;
  jest.isolateModules(() => {
    // A fresh copy needs a synchronous require: Jest here cannot run a dynamic import().
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    i18n = require('./index').default;
  });
  return i18n;
}

describe('i18n', () => {
  it.each([
    ['ca', 'No hi ha connexió. Comprova la xarxa i torna-ho a provar.'],
    ['es', 'No hay conexión. Comprueba la red e inténtalo de nuevo.'],
    ['en', 'No connection. Check your network and try again.'],
  ])('starts in %s when the device uses it', (code, text) => {
    setDeviceLanguages(code);
    const i18n = loadI18n();

    expect(i18n.language).toBe(code);
    expect(i18n.t('errors.NETWORK_ERROR')).toBe(text);
  });

  it('falls back to Catalan for an unsupported language', () => {
    setDeviceLanguages('fr');
    const i18n = loadI18n();

    expect(i18n.language).toBe('ca');
    expect(i18n.t('errors.NETWORK_ERROR')).toBe(
      'No hi ha connexió. Comprova la xarxa i torna-ho a provar.',
    );
  });

  it('uses the first supported language of the device preferences', () => {
    setDeviceLanguages('fr', 'en', 'es');

    expect(loadI18n().language).toBe('en');
  });

  it('falls back to Catalan when the device reports no language', () => {
    setDeviceLanguages(null);

    expect(loadI18n().language).toBe('ca');
  });

  it('never returns the key for a language without that text', () => {
    setDeviceLanguages('en');
    const i18n = loadI18n();
    i18n.addResourceBundle('ca', 'translation', { only: { ca: 'Només en català' } });

    expect(i18n.t('only.ca')).toBe('Només en català');
  });
});
