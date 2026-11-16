import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../__mocks__/events';
import i18n from '../../shared/i18n';
import { classifyEvents } from './classifyEvents';
import {
  describeEvent,
  formatEventDateTime,
  formatEventWhen,
  formatEventWhere,
} from './formatEvent';

const t = i18n.getFixedT('ca');
const UTC = 'UTC';

function dateTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: UTC,
  }).format(new Date(iso));
}

function time(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: UTC }).format(
    new Date(iso),
  );
}

describe('formatEventWhen', () => {
  it('shows a single date and time for an instantaneous event', () => {
    expect(formatEventWhen(lunarEvent, 'ca', UTC)).toBe(dateTime(lunarEvent.starts_at, 'ca'));
  });

  it('shows only the end time when the event ends the same day', () => {
    expect(formatEventWhen(launchEvent, 'ca', UTC)).toBe(
      `${dateTime(launchEvent.starts_at, 'ca')} – ${time(launchEvent.ends_at, 'ca')}`,
    );
  });

  it('shows both dates when the event lasts several days', () => {
    expect(formatEventWhen(meteorShowerEvent, 'en', UTC)).toBe(
      `${dateTime(meteorShowerEvent.starts_at, 'en')} – ${dateTime(meteorShowerEvent.ends_at, 'en')}`,
    );
  });
});

describe('formatEventDateTime', () => {
  it('shows one date and time in the language of the app', () => {
    expect(formatEventDateTime(launchEvent.starts_at, 'ca', UTC)).toBe(
      dateTime(launchEvent.starts_at, 'ca'),
    );
  });
});

describe('formatEventWhere', () => {
  it('says an event without a location is visible from anywhere', () => {
    expect(formatEventWhere(null, t, 'ca')).toBe('Visible des de qualsevol lloc');
  });

  it('shows the coordinates with their hemisphere in the language of the app', () => {
    expect(formatEventWhere(launchEvent.location, t, 'ca')).toBe('28,56° N · 80,58° O');
    expect(
      formatEventWhere({ latitude: -33.9, longitude: 151.2 }, i18n.getFixedT('en'), 'en'),
    ).toBe('33.90° S · 151.20° E');
  });
});

describe('describeEvent', () => {
  const { active, upcoming } = classifyEvents([launchEvent], [lunarEvent]);

  it('names the event with its category, for screen readers', () => {
    expect(describeEvent(upcoming[0], t)).toBe('Full Moon, Lluna');
  });

  it('says when the event is happening now', () => {
    expect(describeEvent(active[0], t)).toBe(
      'Falcon 9 Block 5 | Starlink Group 10-12, Llançament, Actiu ara',
    );
  });
});
