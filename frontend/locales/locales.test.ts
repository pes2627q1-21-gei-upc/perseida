import ca from './ca.json';
import es from './es.json';
import en from './en.json';

describe('Locales error keys matching (gestio-errors, US #43 & US #91)', () => {
  const expectedCodes = [
    'INVALID_GOOGLE_TOKEN',
    'INVALID_SESSION',
    'ACCOUNT_SUSPENDED',
    'ACCOUNT_DELETED',
    'EMAIL_ALREADY_REGISTERED',
    'IDENTITY_PROVIDER_UNAVAILABLE',
    'SESSION_UNAVAILABLE',
    'NETWORK_ERROR',
    'INTERNAL_ERROR',
  ];

  it('contains all required session and auth error keys in catalan (ca.json)', () => {
    for (const code of expectedCodes) {
      expect(ca.errors).toHaveProperty(code);
      expect(typeof (ca.errors as Record<string, string>)[code]).toBe('string');
      expect((ca.errors as Record<string, string>)[code].length).toBeGreaterThan(0);
    }
  });

  it('contains all required session and auth error keys in spanish (es.json)', () => {
    for (const code of expectedCodes) {
      expect(es.errors).toHaveProperty(code);
      expect(typeof (es.errors as Record<string, string>)[code]).toBe('string');
      expect((es.errors as Record<string, string>)[code].length).toBeGreaterThan(0);
    }
  });

  it('contains all required session and auth error keys in english (en.json)', () => {
    for (const code of expectedCodes) {
      expect(en.errors).toHaveProperty(code);
      expect(typeof (en.errors as Record<string, string>)[code]).toBe('string');
      expect((en.errors as Record<string, string>)[code].length).toBeGreaterThan(0);
    }
  });

  it('ensures keys in ca, es, and en have exact parity', () => {
    const caKeys = Object.keys(ca.errors).sort();
    const esKeys = Object.keys(es.errors).sort();
    const enKeys = Object.keys(en.errors).sort();

    expect(caKeys).toEqual(esKeys);
    expect(caKeys).toEqual(enKeys);
  });
});
