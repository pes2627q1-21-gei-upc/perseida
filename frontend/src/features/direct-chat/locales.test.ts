import ca from '../../../locales/ca.json';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';

type Tree = { [key: string]: string | Tree };
function leafKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leafKeys(value, `${prefix}${key}.`),
  );
}

describe('directChat texts (TG-65)', () => {
  const [catalan, spanish, english] = [ca, es, en].map((file) =>
    leafKeys((file as unknown as { directChat: Tree }).directChat),
  );

  it('has the texts the presentational pieces need', () => {
    expect(catalan).toEqual(
      expect.arrayContaining([
        'unread_one',
        'unread_other',
        'you',
        'blocked',
        'noMessages',
        'conversationWith',
        'lastMessage',
      ]),
    );
  });

  it('has the same keys in catalan, spanish and english', () => {
    expect([...spanish].sort()).toEqual([...catalan].sort());
    expect([...english].sort()).toEqual([...catalan].sort());
  });
});

/** The texts approved in `.agents/skills/gestio-errors/references/cataleg-codis.md`. */
const APPROVED: Record<string, { ca: string; es: string; en: string }> = {
  USER_NOT_FOUND: {
    ca: 'No hem trobat aquest usuari.',
    es: 'No hemos encontrado a este usuario.',
    en: "We couldn't find this user.",
  },
  CANNOT_MESSAGE_SELF: {
    ca: 'No et pots enviar missatges a tu mateix.',
    es: 'No puedes enviarte mensajes a ti mismo.',
    en: "You can't message yourself.",
  },
  CONVERSATION_NOT_FOUND: {
    ca: 'Aquesta conversa no existeix.',
    es: 'Esta conversación no existe.',
    en: "This conversation doesn't exist.",
  },
  USER_BLOCKED: {
    ca: 'Ara no pots enviar missatges en aquesta conversa.',
    es: 'Ahora no puedes enviar mensajes en esta conversación.',
    en: "You can't send messages in this conversation right now.",
  },
};

describe('direct chat error texts (TG-65, approved catalogue)', () => {
  const errors = (file: unknown) => (file as { errors: Record<string, string> }).errors;

  it.each(Object.keys(APPROVED))('%s has the approved text in ca, es and en', (code) => {
    expect(errors(ca)[code]).toBe(APPROVED[code]?.ca);
    expect(errors(es)[code]).toBe(APPROVED[code]?.es);
    expect(errors(en)[code]).toBe(APPROVED[code]?.en);
  });
});
