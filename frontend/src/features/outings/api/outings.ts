import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';

export type Outing = components['schemas']['OutingResponse'];
export type OutingDraft = components['schemas']['OutingCreate'];
export type OutingChanges = components['schemas']['OutingUpdate'];

/** Which outings to list: those of the session, those of an event, or all the future ones. */
export interface OutingFilter {
  mine?: boolean;
  eventId?: string;
}

function invalidResponse(status: number): AppError {
  // 2xx without a body: treat as an unusable response, not as a crash.
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

/** The client middleware already throws AppError on failures and adds the session token. */
export async function listOutings({ mine, eventId }: OutingFilter): Promise<Outing[]> {
  const { data, response } = await api.GET('/api/outings', {
    params: { query: { mine, event_id: eventId } },
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}

export async function getOuting(id: string): Promise<Outing> {
  const { data, response } = await api.GET('/api/outings/{outing_id}', {
    params: { path: { outing_id: id } },
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}

export async function createOuting(draft: OutingDraft): Promise<Outing> {
  const { data, response } = await api.POST('/api/outings', { body: draft });
  if (!data) throw invalidResponse(response.status);
  return data;
}

/** Only the fields given change; `event_id: null` unlinks the event. */
export async function updateOuting(id: string, changes: OutingChanges): Promise<Outing> {
  const { data, response } = await api.PATCH('/api/outings/{outing_id}', {
    params: { path: { outing_id: id } },
    body: changes,
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}

export async function deleteOuting(id: string): Promise<void> {
  await api.DELETE('/api/outings/{outing_id}', { params: { path: { outing_id: id } } });
}
