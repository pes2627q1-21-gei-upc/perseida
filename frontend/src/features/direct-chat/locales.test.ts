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
