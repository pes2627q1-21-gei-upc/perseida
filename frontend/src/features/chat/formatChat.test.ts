import { formatMessageTime } from './formatChat';

const UTC = 'UTC';
const NOW = new Date('2026-11-19T15:00:00Z');

function time(iso: string, locale: string, timeZone = UTC) {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(new Date(iso));
}

function date(iso: string, locale: string, timeZone = UTC) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone }).format(new Date(iso));
}

describe('formatMessageTime (TG-469)', () => {
  it('shows only the time for a message of the same day', () => {
    expect(formatMessageTime('2026-11-19T09:05:00Z', NOW, 'ca', UTC)).toBe(
      time('2026-11-19T09:05:00Z', 'ca'),
    );
  });

  it('shows only the date for a message of another day', () => {
    expect(formatMessageTime('2026-11-17T09:05:00Z', NOW, 'ca', UTC)).toBe(
      date('2026-11-17T09:05:00Z', 'ca'),
    );
  });

  it('tells the day in the time zone of the device, not in UTC', () => {
    // 23:30Z on the 18th is already the 19th in Madrid (UTC+1), the same day as `NOW` there.
    const sent = '2026-11-18T23:30:00Z';
    expect(formatMessageTime(sent, NOW, 'ca', 'Europe/Madrid')).toBe(
      time(sent, 'ca', 'Europe/Madrid'),
    );
    expect(formatMessageTime(sent, NOW, 'ca', UTC)).toBe(date(sent, 'ca'));
  });

  it('uses the language of the app', () => {
    expect(formatMessageTime('2026-11-17T09:05:00Z', NOW, 'en', UTC)).toBe(
      date('2026-11-17T09:05:00Z', 'en'),
    );
    expect(formatMessageTime('2026-11-17T09:05:00Z', NOW, 'en', UTC)).not.toBe(
      date('2026-11-17T09:05:00Z', 'ca'),
    );
  });
});
