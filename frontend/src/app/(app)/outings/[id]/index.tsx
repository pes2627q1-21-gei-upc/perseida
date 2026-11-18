import { useLocalSearchParams } from 'expo-router';

import { OutingDetailScreen } from '../../../../features/outings/components/OutingDetailScreen';

/** `/outings/{id}`: one outing (TG-629). */
export default function OutingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OutingDetailScreen id={id} />;
}
