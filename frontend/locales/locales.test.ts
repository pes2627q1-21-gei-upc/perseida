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
      'composer.tooLong': 'El missatge pot tenir com a màxim {{max}} caràcters.',
      'messages.label': 'Missatges del xat',
      'messages.loadingOlder': 'Carregant missatges anteriors',
    });
    expect(texts['message.uncertain']).toMatch(/ja s'hagi enviat/i);
  });
});

describe('Locales of the meeting points (TG-352)', () => {
  // Texts the meeting points components show. Their wording is free; they must exist everywhere.
  const meetingPointKeys = [
    'title',
    'loading',
    'empty',
    'retry',
    'retryHint',
    'choose',
    'list.label',
    'profile.label',
    'profile.watch_party',
    'profile.study',
    'type.library',
    'type.cafe',
    'type.other',
    'attribute.wifi',
    'attribute.silence.silent',
    'attribute.silence.murmur',
    'attribute.silence.noisy',
    'attribute.plugs.many',
    'attribute.plugs.few',
    'attribute.plugs.none',
    'attribute.groupFriendly',
    'attribute.notGroupFriendly',
  ];
  // Criterion 5: the approved text of the error, in each language.
  const unavailable = {
    ca: "Ara no podem recomanar locals. Torna-ho a provar d'aquí a una estona.",
    es: 'Ahora no podemos recomendar locales. Vuelve a intentarlo en un rato.',
    en: "We can't recommend places right now. Please try again in a while.",
  };
  type Texts = Record<string, unknown>;
  const languages = { ca, es, en } as unknown as Record<
    'ca' | 'es' | 'en',
    { errors: Record<string, string>; meetingPoints?: Texts }
  >;
  const textAt = (node: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((value, key) => (value as Texts)?.[key], node);
  /** Every leaf of the texts as `path -> text`. */
  const leaves = (node: Texts, prefix = ''): [string, string][] =>
    Object.entries(node).flatMap(([key, value]) =>
      typeof value === 'object' && value !== null
        ? leaves(value as Texts, `${prefix}${key}.`)
        : [[`${prefix}${key}`, String(value)] as [string, string]],
    );

  describe.each(['ca', 'es', 'en'] as const)('%s', (language) => {
    it.each(meetingPointKeys)('has a text for meetingPoints.%s', (key) => {
      const text = textAt(languages[language].meetingPoints, key);

      expect(typeof text).toBe('string');
      expect((text as string).length).toBeGreaterThan(0);
    });

    it('has the approved text for errors.MEETING_POINTS_UNAVAILABLE', () => {
      expect(languages[language].errors.MEETING_POINTS_UNAVAILABLE).toBe(unavailable[language]);
    });

    it('puts the name of the point in the text to choose it', () => {
      expect(textAt(languages[language].meetingPoints, 'choose')).toMatch(/{{name}}/);
    });

    it('has chip texts that do not contain one another, so each chip is told apart', () => {
      const chips = meetingPointKeys
        .filter((key) => key.startsWith('attribute.'))
        .map((key) => String(textAt(languages[language].meetingPoints, key) ?? key).toLowerCase());

      for (const [index, chip] of chips.entries()) {
        for (const other of chips.filter((_, each) => each !== index)) {
          expect(other).not.toContain(chip);
        }
      }
    });
  });

  it('has the same meeting points keys in ca, es and en', () => {
    const keys = (language: 'ca' | 'es' | 'en') =>
      leaves(languages[language].meetingPoints ?? {})
        .map(([path]) => path)
        .sort();

    expect(keys('ca').length).toBeGreaterThan(0);
    expect(keys('es')).toEqual(keys('ca'));
    expect(keys('en')).toEqual(keys('ca'));
  });
});
