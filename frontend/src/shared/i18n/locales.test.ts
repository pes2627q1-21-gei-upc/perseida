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

  // TG-646 criterion 6: the texts of the outings on the map. The parity test above only
  // compares the languages with each other, so each new key is named here.
  it.each(Object.entries(locales))(
    '%s has the texts of the outings on the map',
    (_language, locale) => {
      const keys = keysOf(locale);

      for (const key of [
        'events.filter.outings',
        'events.empty.outings',
        'events.outings.kind',
        'events.outings.open',
        'events.outings.linkedEvent',
      ]) {
        expect(keys).toContain(key);
      }
    },
  );

  // TG-51: texts of the filterable list of the Events tab.
  const searchKeys = [
    'events.search.categories',
    'events.search.range.label',
    'events.search.range.days7',
    'events.search.range.days30',
    'events.search.range.days90',
    'events.search.near.label',
    'events.search.near.locating',
    'events.search.near.denied',
    'events.search.distance',
    'events.search.results_one',
    'events.search.results_other',
    'events.search.empty',
    'events.search.openMap',
  ];

  it.each(Object.entries(locales))(
    '%s has the texts of the events search (TG-51)',
    (_language, locale) => {
      const keys = keysOf(locale);
      const missing = searchKeys.filter((key) => !keys.includes(key));

      expect(missing).toEqual([]);
    },
  );

  it.each(Object.entries(locales))(
    '%s interpolates the distance and the count of results (TG-51)',
    (_language, locale) => {
      const search = (locale as unknown as { events: { search?: Record<string, string> } }).events
        .search;

      expect(search?.distance).toContain('{{distance}}');
      expect(search?.results_other).toContain('{{count}}');
    },
  );
});
