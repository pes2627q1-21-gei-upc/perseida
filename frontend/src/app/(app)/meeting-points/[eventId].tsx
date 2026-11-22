import { useLocalSearchParams } from 'expo-router';

import { MeetingPointsScreen } from '../../../features/meeting-points/components/MeetingPointsScreen';

/** `/meeting-points/{eventId}`: the places recommended to meet for an event (TG-352). */
export default function MeetingPointsRoute() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <MeetingPointsScreen eventId={eventId} />;
}
