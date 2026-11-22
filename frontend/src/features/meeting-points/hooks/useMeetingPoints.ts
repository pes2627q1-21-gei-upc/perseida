import { skipToken, useQuery } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import {
  fetchMeetingPoints,
  type MeetingPoint,
  type MeetingPointProfile,
} from '../api/meetingPoints';

/** Where the person is (WGS 84). */
export interface Position {
  latitude: number;
  longitude: number;
}

export const meetingPointKeys = {
  all: ['meetingPoints'] as const,
  list: (profile: MeetingPointProfile, position: Position | null) =>
    [...meetingPointKeys.all, profile, position?.latitude, position?.longitude] as const,
};

/**
 * The meeting points of the profile around the position (TG-352). Nothing is asked while there
 * is no position. It never retries by itself (each call counts against the Spotwise limit): only
 * the retry button of the list does.
 */
export function useMeetingPoints(profile: MeetingPointProfile, position: Position | null) {
  return useQuery<MeetingPoint[], AppError>({
    queryKey: meetingPointKeys.list(profile, position),
    queryFn: position ? () => fetchMeetingPoints({ profile, ...position }) : skipToken,
    retry: false,
  });
}
