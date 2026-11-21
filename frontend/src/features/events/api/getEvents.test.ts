import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import {
  launchEvent,
  lunarEvent,
  meteorShowerEvent,
  solarEvent,
} from '../../../../__mocks__/events';
import { AppError } from '../../../shared/errors';
import {
  type EventSearchFilters,
  getActiveEvents,
  getUpcomingEvents,
  searchEvents,
  searchRange,
} from './getEvents';

afterEach(() => {
  jest.restoreAllMocks();
});

function requestedUrl(spy: jest.SpyInstance): URL {
  const input = spy.mock.calls[0][0] as Request | string;
  return new URL(typeof input === 'string' ? input : input.url);
}

describe('getActiveEvents', () => {
  it('returns the active events of the contract from /api/events/active', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse([meteorShowerEvent]));

    await expect(getActiveEvents()).resolves.toEqual([meteorShowerEvent]);
    expect(requestedUrl(fetchSpy).pathname).toBe('/api/events/active');
  });

  it('rejects with a non-retryable AppError when a 200 comes without a body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));

    const failure = await getActiveEvents().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', status: 200, retryable: false });
  });
});

describe('getUpcomingEvents', () => {
  it('asks /api/events/upcoming for the given number of days', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse([launchEvent, lunarEvent]));

    await expect(getUpcomingEvents(30)).resolves.toEqual([launchEvent, lunarEvent]);
    const url = requestedUrl(fetchSpy);
    expect(url.pathname).toBe('/api/events/upcoming');
    expect(url.searchParams.get('days')).toBe('30');
  });

  it('rejects with a non-retryable AppError when a 200 comes without a body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));

    const failure = await getUpcomingEvents(30).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });
});

describe('searchRange (TG-51: date filter of predefined ranges, in UTC days)', () => {
  const NOW = new Date('2026-11-21T10:00:00Z');

  it.each([
    [7, '2026-11-28'],
    [30, '2026-12-21'],
    [90, '2027-02-19'],
  ] as const)('goes from today to %i days later', (range, to) => {
    expect(searchRange(range, NOW)).toEqual({ from: '2026-11-21', to });
  });

  it('crosses the end of the month', () => {
    expect(searchRange(7, new Date('2026-11-28T12:00:00Z'))).toEqual({
      from: '2026-11-28',
      to: '2026-12-05',
    });
  });

  it('counts the days in UTC, not in the time zone of the device', () => {
    // 23:30 in New York is already the next day in UTC.
    expect(searchRange(7, new Date('2026-11-21T23:30:00-05:00'))).toEqual({
      from: '2026-11-22',
      to: '2026-11-29',
    });
  });

  it('uses the current date when none is given', () => {
    const today = new Date().toISOString().slice(0, 10);

    expect(searchRange(30).from).toBe(today);
  });
});

describe('searchEvents (TG-51: filterable list of events)', () => {
  const NOW = new Date('2026-11-21T10:00:00Z');
  const ALL: EventSearchFilters = { categories: [], range: 30, near: null };

  it('asks /api/events for the date range and returns the events of the contract', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse([meteorShowerEvent, lunarEvent]));

    await expect(searchEvents(ALL, NOW)).resolves.toEqual([meteorShowerEvent, lunarEvent]);
    const url = requestedUrl(fetchSpy);
    expect(url.pathname).toBe('/api/events');
    expect(url.searchParams.get('from')).toBe('2026-11-21');
    expect(url.searchParams.get('to')).toBe('2026-12-21');
  });

  it('sends no category, coordinates or radius when there is no filter (all the categories)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse([]));

    await searchEvents(ALL, NOW);

    const url = requestedUrl(fetchSpy);
    expect(url.searchParams.has('category')).toBe(false);
    expect(url.searchParams.has('lat')).toBe(false);
    expect(url.searchParams.has('lon')).toBe(false);
    expect(url.searchParams.has('radius_km')).toBe(false);
  });

  it('repeats category once per chosen category', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse([lunarEvent, solarEvent]));

    await searchEvents({ ...ALL, categories: ['lunar', 'solar'] }, NOW);

    const url = requestedUrl(fetchSpy);
    expect(url.searchParams.getAll('category')).toEqual(['lunar', 'solar']);
    expect(url.search).toContain('category=lunar&category=solar');
  });

  it('sends the range of the filter', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse([]));

    await searchEvents({ ...ALL, range: 7 }, NOW);

    const url = requestedUrl(fetchSpy);
    expect(url.searchParams.get('from')).toBe('2026-11-21');
    expect(url.searchParams.get('to')).toBe('2026-11-28');
  });

  it('sends lat and lon with «Near me», but no radius (the backend sets it)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse([launchEvent]));

    await searchEvents({ ...ALL, near: { latitude: 41.3874, longitude: 2.1686 } }, NOW);

    const url = requestedUrl(fetchSpy);
    expect(url.searchParams.get('lat')).toBe('41.3874');
    expect(url.searchParams.get('lon')).toBe('2.1686');
    expect(url.searchParams.has('radius_km')).toBe(false);
  });

  it('rejects with a non-retryable AppError when a 200 comes without a body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));

    const failure = await searchEvents(ALL, NOW).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', status: 200, retryable: false });
  });

  it('rejects with the AppError of the problem+json of the API', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(422, 'VALIDATION_ERROR'));

    const failure = await searchEvents(ALL, NOW).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'VALIDATION_ERROR', retryable: false });
  });
});
