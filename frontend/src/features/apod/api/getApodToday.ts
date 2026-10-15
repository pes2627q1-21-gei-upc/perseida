import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';

export type Apod = components['schemas']['ApodResponse'];

/** Today's APOD. The client middleware already throws AppError on any failure. */
export async function getApodToday(): Promise<Apod> {
  const { data, response } = await api.GET('/api/apod');
  if (!data) {
    // 2xx without a body: treat as an unusable response, not as a crash.
    throw new AppError({
      kind: 'http',
      code: 'INVALID_RESPONSE',
      status: response.status,
      retryable: false,
    });
  }
  return data;
}
