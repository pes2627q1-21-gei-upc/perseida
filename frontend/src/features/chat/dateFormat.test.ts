import { dateTimeFormat } from './dateFormat';

// Building an Intl.DateTimeFormat is costly and a room formats one date per bubble and per day:
// the formatters are made once per language, time zone and options (TG-469).
describe('dateTimeFormat (TG-469)', () => {
  it('gives the same formatter for the same language and options', () => {
    expect(dateTimeFormat('ca', { timeStyle: 'short' })).toBe(
      dateTimeFormat('ca', { timeStyle: 'short' }),
    );
  });

  it.each([
    ['another language', 'es', { timeStyle: 'short' }],
    ['other options', 'ca', { dateStyle: 'long' }],
    ['another time zone', 'ca', { timeStyle: 'short', timeZone: 'UTC' }],
  ] as const)('gives another formatter for %s', (_case, locale, options) => {
    expect(dateTimeFormat(locale, options)).not.toBe(dateTimeFormat('ca', { timeStyle: 'short' }));
  });

  it('formats as Intl does', () => {
    const date = new Date('2026-11-17T10:00:00Z');
    const options = { dateStyle: 'long', timeZone: 'Europe/Madrid' } as const;

    expect(dateTimeFormat('ca', options).format(date)).toBe(
      new Intl.DateTimeFormat('ca', options).format(date),
    );
  });
});
