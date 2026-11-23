import { Slot } from 'expo-router';

import { AdminGate } from '../../../features/admin/components/AdminGate';
import { AdminShell } from '../../../features/admin/components/AdminShell';

/**
 * Admin panel group (ADR-0020): every route under /panel goes through the access gate and is
 * drawn inside the shell (top bar and scene).
 */
export default function PanelLayout() {
  return (
    <AdminGate>
      <AdminShell>
        <Slot />
      </AdminShell>
    </AdminGate>
  );
}
