import { jsonResponse } from '../../../../__mocks__/apod';
import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { AppError } from '../../../shared/errors';
import { getActiveEvents, getUpcomingEvents } from './getEvents';

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
