import { Slot } from 'expo-router';

import { AdminGate } from '../../../features/admin/components/AdminGate';

/** Admin panel group (ADR-0020): every route under /panel goes through the access gate. */
export default function PanelLayout() {
  return (
    <AdminGate>
      <Slot />
    </AdminGate>
  );
}
