import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { authHeaders } from '../../auth/authHeaders';

export type MeetingPoint = components['schemas']['MeetingPointResponse'];
export type MeetingPointProfile = components['schemas']['MeetingPointProfile'];

/** What the meeting is for and where the person is (WGS 84). */
export interface MeetingPointQuery {
  profile: MeetingPointProfile;
  latitude: number;
  longitude: number;
}

/**
 * The places recommended by Spotwise around the position, in the order of the API (TG-352).
 * The endpoint is private: it needs the session (see authHeaders).
 */
export async function fetchMeetingPoints({
  profile,
  latitude,
  longitude,
}: MeetingPointQuery): Promise<MeetingPoint[]> {
  const { data, response } = await api.GET('/api/meeting-points', {
    params: { query: { profile, lat: latitude, lon: longitude } },
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
