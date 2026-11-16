import ca from '../../../locales/ca.json';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';

const locales = { ca, es, en };

/** Dotted path of every text in a locale file, e.g. `errors.NETWORK_ERROR`. */
function keysOf(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keysOf(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const allKeys = [...new Set(Object.values(locales).flatMap((locale) => keysOf(locale)))].sort();

describe('locales', () => {
  it.each(Object.entries(locales))(
    '%s has every key that any language has',
    (_language, locale) => {
      const missing = allKeys.filter((key) => !keysOf(locale).includes(key));

      expect(missing).toEqual([]);
    },
  );
});
