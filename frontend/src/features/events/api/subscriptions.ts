import { api } from '../../../shared/api/client';
import { AppError } from '../../../shared/errors';
import { withSession } from '../../auth/api/authorized';
import type { AstronomicalEvent } from './getEvents';

/**
 * Every subscription endpoint needs a session (TG-53). `withSession` sends it and, after a 401,
 * renews it once and repeats the request.
 */
export async function listMySubscriptions(): Promise<AstronomicalEvent[]> {
  return withSession(async (headers) => {
    const { data, response } = await api.GET('/api/me/subscriptions', { headers });
    // 2xx without a body: treat as an unusable response, not as a crash.
    if (!data) {
      throw new AppError({
        kind: 'http',
        code: 'INVALID_RESPONSE',
        status: response.status,
        retryable: false,
      });
    }
    return data;
  });
}

/** Idempotent: already following the event also resolves. The response has no body. */
export async function subscribe(eventId: string): Promise<void> {
  await withSession((headers) =>
    api.PUT('/api/events/{event_id}/subscription', {
      params: { path: { event_id: eventId } },
      headers,
    }),
  );
}

/** Idempotent: not following the event also resolves. */
export async function unsubscribe(eventId: string): Promise<void> {
  await withSession((headers) =>
    api.DELETE('/api/events/{event_id}/subscription', {
      params: { path: { event_id: eventId } },
      headers,
    }),
  );
}
