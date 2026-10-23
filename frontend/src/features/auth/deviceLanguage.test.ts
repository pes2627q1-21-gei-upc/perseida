import { DEFAULT_LANGUAGE, getDeviceLanguage } from './deviceLanguage';

describe('deviceLanguage · getDeviceLanguage', () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;

  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
  });

  function mockLocale(locale: string) {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ locale }),
        }) as unknown as Intl.DateTimeFormat,
    );
  }

  it('detects Catalan locale variants (ca, ca-ES, ca_ES)', () => {
    mockLocale('ca-ES');
    expect(getDeviceLanguage()).toBe('ca');

    mockLocale('ca');
    expect(getDeviceLanguage()).toBe('ca');
  });

  it('detects Spanish locale variants (es, es-ES, es-419)', () => {
    mockLocale('es-ES');
    expect(getDeviceLanguage()).toBe('es');

    mockLocale('es-419');
    expect(getDeviceLanguage()).toBe('es');
  });

  it('detects English locale variants (en, en-US, en-GB)', () => {
    mockLocale('en-US');
    expect(getDeviceLanguage()).toBe('en');

    mockLocale('en-GB');
    expect(getDeviceLanguage()).toBe('en');
  });

  it('falls back to default language (ca) for unsupported languages', () => {
    mockLocale('fr-FR');
    expect(getDeviceLanguage()).toBe(DEFAULT_LANGUAGE);

    mockLocale('de-DE');
    expect(getDeviceLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('falls back safely when Intl throws an error', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl not available');
    });

    expect(getDeviceLanguage()).toBe(DEFAULT_LANGUAGE);
  });
});
