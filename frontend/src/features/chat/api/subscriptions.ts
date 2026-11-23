import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { withSession } from '../../auth/api/authorized';

export type SubscribedEvent = components['schemas']['EventResponse'];

/** The events the user is subscribed to, also the ones that already ended (TG-469). */
export async function listSubscribedEvents(): Promise<SubscribedEvent[]> {
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
