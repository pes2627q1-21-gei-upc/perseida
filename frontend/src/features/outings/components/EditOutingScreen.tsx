import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useOuting, useUpdateOuting } from '../hooks/useOutings';
import { type OutingFormValues, outingToValues, toChanges } from '../outingForm';
import { OutingForm } from './OutingForm';
import { OutingsFrame, ScrollColumn } from './OutingsFrame';
import { OutingsStatus } from './OutingsStatus';

/** Edit an outing (TG-629): the form with its values; only what changed is sent. */
export function EditOutingScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const outing = useOuting(id);
  const update = useUpdateOuting(id);
  const initial = useMemo(
    () => (outing.data ? outingToValues(outing.data) : undefined),
    [outing.data],
  );

  function leave() {
    // Opened from a link there is nowhere to go back to: show the outing instead.
    if (router.canGoBack()) router.back();
    else router.replace(`/outings/${id}`);
  }

  async function submit(values: OutingFormValues) {
    if (!initial) return;
    const changes = toChanges(values, initial);
    // Nothing changed: there is nothing to send, and the dates are not checked again.
    if (Object.keys(changes).length > 0) await update.mutateAsync(changes);
    leave();
  }

  return (
    <OutingsFrame title={t('outings.form.editTitle')}>
      {(topInset) => (
        <>
          {initial && (
            <ScrollColumn topInset={topInset}>
              <OutingForm initial={initial} editing onSubmit={submit} />
            </ScrollColumn>
          )}
          {outing.isPending && <OutingsStatus state="loading" />}
          {outing.isError && (
            <OutingsStatus
              state="error"
              code={outing.error.code}
              onRetry={outing.error.retryable ? () => void outing.refetch() : undefined}
            />
          )}
        </>
      )}
    </OutingsFrame>
  );
}
