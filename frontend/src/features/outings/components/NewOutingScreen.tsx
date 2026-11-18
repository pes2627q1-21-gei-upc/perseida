import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateOuting } from '../hooks/useOutings';
import { newOutingValues, type OutingFormValues, toDraft } from '../outingForm';
import { OutingForm } from './OutingForm';
import { OutingsFrame, ScrollColumn } from './OutingsFrame';

/**
 * Create an outing (TG-629). Opened from the outings of an event, it starts linked to that
 * event. Once created, its detail opens in place of this screen, so back does not return here.
 */
export function NewOutingScreen({ eventId }: { eventId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const create = useCreateOuting();
  const initial = useMemo(() => newOutingValues(eventId ?? null), [eventId]);

  async function submit(values: OutingFormValues) {
    const created = await create.mutateAsync(toDraft(values));
    router.replace(`/outings/${created.id}`);
  }

  return (
    <OutingsFrame title={t('outings.form.newTitle')}>
      {(topInset) => (
        <ScrollColumn topInset={topInset}>
          <OutingForm initial={initial} onSubmit={submit} />
        </ScrollColumn>
      )}
    </OutingsFrame>
  );
}
