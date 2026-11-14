import { launchEvent, lunarEvent, meteorShowerEvent, solarEvent } from '../../../__mocks__/events';
import { classifyEvents, filterEvents } from './classifyEvents';

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
});
