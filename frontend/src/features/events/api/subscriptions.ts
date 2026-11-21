import { api } from '../../../shared/api/client';
import { AppError } from '../../../shared/errors';
import { authHeaders } from '../../auth/authHeaders';
import type { AstronomicalEvent } from './getEvents';

/** Every subscription endpoint needs a session (TG-53): see authHeaders. */
export async function listMySubscriptions(): Promise<AstronomicalEvent[]> {
  const { data, response } = await api.GET('/api/me/subscriptions', {
    headers: await authHeaders(),
  });
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
}

/** Idempotent: already following the event also resolves. The response has no body. */
export async function subscribe(eventId: string): Promise<void> {
  await api.PUT('/api/events/{event_id}/subscription', {
    params: { path: { event_id: eventId } },
    headers: await authHeaders(),
  });
}

/** Idempotent: not following the event also resolves. */
export async function unsubscribe(eventId: string): Promise<void> {
  await api.DELETE('/api/events/{event_id}/subscription', {
    params: { path: { event_id: eventId } },
    headers: await authHeaders(),
  });
}
