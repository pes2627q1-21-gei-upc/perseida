import { useLocalSearchParams } from 'expo-router';

import { EditOutingScreen } from '../../../../features/outings/components/EditOutingScreen';

/** `/outings/{id}/edit`: edit an outing (TG-629). */
export default function EditOutingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditOutingScreen id={id} />;
}
