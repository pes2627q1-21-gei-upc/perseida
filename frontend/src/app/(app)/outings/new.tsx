import { useLocalSearchParams } from 'expo-router';

import { NewOutingScreen } from '../../../features/outings/components/NewOutingScreen';

/** `/outings/new`, linked to an event with `?eventId=` (TG-629). */
export default function NewOutingRoute() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  return <NewOutingScreen eventId={eventId} />;
}
