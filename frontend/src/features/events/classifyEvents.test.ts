import { launchEvent, lunarEvent, meteorShowerEvent, solarEvent } from '../../../__mocks__/events';
import { classifyEvents, filterEvents, statusOn, utcDay } from './classifyEvents';

describe('classifyEvents', () => {
  it('marks the active events as active and the upcoming ones as upcoming', () => {
    const result = classifyEvents([meteorShowerEvent], [lunarEvent]);

    expect(result.active).toEqual([{ ...meteorShowerEvent, status: 'active' }]);
    expect(result.upcoming).toEqual([{ ...lunarEvent, status: 'upcoming' }]);
  });

  it('counts an event that is in both lists as active only', () => {
    const result = classifyEvents([launchEvent], [launchEvent, lunarEvent]);

    expect(result.active.map((event) => event.id)).toEqual([launchEvent.id]);
    expect(result.upcoming.map((event) => event.id)).toEqual([lunarEvent.id]);
    expect(result.all.filter((event) => event.id === launchEvent.id)).toEqual([
      { ...launchEvent, status: 'active' },
    ]);
  });

  it('joins both lists by id in "all", ordered by start and then by id', () => {
    const result = classifyEvents([meteorShowerEvent, launchEvent], [solarEvent, lunarEvent]);

    expect(result.all.map((event) => event.id)).toEqual([
      launchEvent.id,
      meteorShowerEvent.id,
      lunarEvent.id,
      solarEvent.id,
    ]);
  });

  it('orders events that start at the same time by id', () => {
    const later = { ...lunarEvent, id: '01a19288-a3f6-7576-a37b-ffffffffffff' };
    const earlier = { ...lunarEvent, id: '01a19288-a3f6-7576-a37b-000000000000' };

    const result = classifyEvents([later], [earlier]);

    expect(result.all.map((event) => event.id)).toEqual([earlier.id, later.id]);
  });

  it('keeps the events without a location', () => {
    const result = classifyEvents([meteorShowerEvent], []);

    expect(result.all).toEqual([{ ...meteorShowerEvent, status: 'active' }]);
  });

  it('returns empty lists when there are no events', () => {
    expect(classifyEvents([], [])).toEqual({ active: [], upcoming: [], all: [] });
  });
});

describe('filterEvents', () => {
  const classified = classifyEvents([meteorShowerEvent], [lunarEvent]);

  it('returns the list that matches the filter', () => {
    expect(filterEvents(classified, 'active')).toBe(classified.active);
    expect(filterEvents(classified, 'upcoming')).toBe(classified.upcoming);
    expect(filterEvents(classified, 'all')).toBe(classified.all);
  });

  // TG-646 (TG-52 criterion 2): the Outings filter has no events of its own; the outings come
  // from another hook and the map joins them.
  it('has no events with the Outings filter, which is only for outings (TG-646)', () => {
    expect(filterEvents(classified, 'outings')).toEqual([]);
  });
});

describe('utcDay (TG-51)', () => {
  it('gives the day of a date in UTC as YYYY-MM-DD', () => {
    expect(utcDay(new Date('2026-11-21T10:00:00Z'))).toBe('2026-11-21');
  });

  it('counts the day in UTC, not in the time zone of the device', () => {
    // 23:30 in New York is already the next day in UTC.
    expect(utcDay(new Date('2026-11-21T23:30:00-05:00'))).toBe('2026-11-22');
  });
});

describe('statusOn (TG-51: «active now» as GET /api/events/active, today in UTC)', () => {
  const NOW = new Date('2026-11-21T10:00:00Z');
  const span = (starts_at: string, ends_at: string = starts_at) => ({ starts_at, ends_at });

  it('is active when the event lasts across today', () => {
    expect(statusOn(span('2026-11-06T00:00:00Z', '2026-11-30T23:59:59Z'), NOW)).toBe('active');
  });

  it('is active for an instantaneous event later today', () => {
    expect(statusOn(span('2026-11-21T14:53:00Z'), NOW)).toBe('active');
  });

  it('is active for an instantaneous event at 00:00Z today', () => {
    expect(statusOn(span('2026-11-21T00:00:00Z'), NOW)).toBe('active');
  });

  it('is active for an event that ends just at 00:00Z today', () => {
    expect(statusOn(span('2026-11-20T20:00:00Z', '2026-11-21T00:00:00Z'), NOW)).toBe('active');
  });

  it('is active for an event that starts at the last second of today', () => {
    expect(statusOn(span('2026-11-21T23:59:59Z', '2026-11-22T02:00:00Z'), NOW)).toBe('active');
  });

  it('is upcoming for an event that starts at 00:00Z tomorrow', () => {
    expect(statusOn(span('2026-11-22T00:00:00Z', '2026-11-22T03:00:00Z'), NOW)).toBe('upcoming');
  });

  it('does not depend on the hour of today', () => {
    const event = span('2026-11-21T14:53:00Z');

    expect(statusOn(event, new Date('2026-11-21T00:00:00Z'))).toBe('active');
    expect(statusOn(event, new Date('2026-11-21T23:59:59Z'))).toBe('active');
    expect(statusOn(event, new Date('2026-11-22T00:00:00Z'))).not.toBe('active');
  });
});
