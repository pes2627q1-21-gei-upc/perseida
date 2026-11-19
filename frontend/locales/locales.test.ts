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
    'retryHint',
    'refresh',
    'noMessages',
    'unknownAuthor',
    'list.label',
    'empty.message',
    'empty.cta',
    // The room (TG-469).
    'you',
    'message.label',
    'message.sending',
    'message.failed',
    'message.uncertain',
    'message.retry',
    'composer.label',
    'composer.send',
    'composer.counter',
    'composer.tooLong',
    'messages.label',
    'messages.loadingOlder',
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

describe('Texts of the chat errors that cannot be retried (TG-469)', () => {
  // A 422 is never retried by the app: the screen shows no «try again» button, so the text must
  // not promise one. It says what to do instead: open the room again.
  const finalCodes = ['CHAT_INVALID_CURSOR', 'CHAT_INVALID_LIMIT'];
  const invitesToRetry = /torna-ho a provar|inténtalo de nuevo|vuelve a intentarlo|try again/i;
  const reopens = {
    ca: /torna a obrir la sala/i,
    es: /vuelve a abrir la sala/i,
    en: /reopen the room/i,
  };
  const languages = { ca, es, en } as unknown as Record<
    'ca' | 'es' | 'en',
    { errors: Record<string, string> }
  >;

  describe.each(['ca', 'es', 'en'] as const)('%s', (language) => {
    it.each(finalCodes)(
      'errors.%s does not invite to try again, it says to open the room again',
      (code) => {
        const text = languages[language].errors[code] ?? '';

        expect(text).not.toMatch(invitesToRetry);
        expect(text).toMatch(reopens[language]);
      },
    );
  });
});

describe('Texts of the chat room (TG-469)', () => {
  type Chat = Record<string, unknown>;
  const chat = { ca, es, en } as unknown as Record<'ca' | 'es' | 'en', { chat: Chat }>;
  /** Every leaf of the chat texts as `path -> text`. */
  const leaves = (node: Chat, prefix = ''): [string, string][] =>
    Object.entries(node).flatMap(([key, value]) =>
      typeof value === 'object' && value !== null
        ? leaves(value as Chat, `${prefix}${key}.`)
        : [[`${prefix}${key}`, String(value)] as [string, string]],
    );
  const placeholders = (text: string) => (text.match(/{{\w+}}/g) ?? []).sort();

  it('has the same keys in ca, es and en', () => {
    const keys = (language: 'ca' | 'es' | 'en') =>
      leaves(chat[language].chat)
        .map(([path]) => path)
        .sort();

    expect(keys('es')).toEqual(keys('ca'));
    expect(keys('en')).toEqual(keys('ca'));
  });

  it.each(leaves(ca.chat as Chat))(
    'chat.%s keeps the same {{placeholders}} in es and en',
    (path, text) => {
      const at = (language: 'es' | 'en') =>
        leaves(chat[language].chat).find(([candidate]) => candidate === path)?.[1] ?? '';

      expect(placeholders(at('es'))).toEqual(placeholders(text));
      expect(placeholders(at('en'))).toEqual(placeholders(text));
    },
  );

  it('has the Catalan texts the room shows', () => {
    const texts = Object.fromEntries(leaves(ca.chat as Chat));

    expect(texts).toMatchObject({
      you: 'Tu',
      'message.label': '{{author}}, {{time}}: {{text}}',
      'message.sending': 'Enviant',
      'message.failed': "No s'ha pogut enviar el missatge.",
      'message.retry': 'Reintenta',
      'composer.label': 'Escriu un missatge',
      'composer.send': 'Envia',
      'composer.counter': '{{count}} de {{max}} caràcters',
      'composer.tooLong': 'El missatge pot tenir com a màxim 1.000 caràcters.',
      'messages.label': 'Missatges del xat',
      'messages.loadingOlder': 'Carregant missatges anteriors',
    });
    expect(texts['message.uncertain']).toMatch(/ja s'hagi enviat/i);
  });
});
