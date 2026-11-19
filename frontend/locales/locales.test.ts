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

describe('Locales of the chat (TG-469)', () => {
  // Codes of the chat API that the app can receive and had no text yet.
  const chatErrorCodes = [
    'FORBIDDEN',
    'RATE_LIMITED',
    'NOT_SUBSCRIBED',
    'PUBSUB_UNAVAILABLE',
    'VALIDATION_ERROR',
    'CHAT_INVALID_CURSOR',
    'CHAT_INVALID_LIMIT',
  ];
  const chatKeys = [
    'title',
    'loading',
    'retry',
    'noMessages',
    'unknownAuthor',
    'list.label',
    'empty.message',
    'empty.cta',
  ];

  const languages = { ca, es, en } as unknown as Record<
    string,
    { errors: Record<string, unknown>; chat?: Record<string, unknown> }
  >;
  const textAt = (node: unknown, path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], node);

  describe.each(Object.keys(languages))('%s', (language) => {
    it.each(chatErrorCodes)('has a text for errors.%s', (code) => {
      const text = languages[language]?.errors[code];

      expect(typeof text).toBe('string');
      expect((text as string).length).toBeGreaterThan(0);
    });

    it.each(chatKeys)('has a text for chat.%s', (key) => {
      const text = textAt(languages[language]?.chat, key);

      expect(typeof text).toBe('string');
      expect((text as string).length).toBeGreaterThan(0);
    });
  });
});
