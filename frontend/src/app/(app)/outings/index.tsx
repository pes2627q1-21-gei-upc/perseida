import { useLocalSearchParams } from 'expo-router';

import { OutingsScreen } from '../../../features/outings/components/OutingsScreen';

/** `/outings` (the outings of the person) and `/outings?eventId=` (the ones of an event): TG-629. */
export default function OutingsRoute() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  return <OutingsScreen eventId={eventId} />;
}
