import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { errorMessage, isAppError } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { ConfirmDialog } from '../../../shared/ui';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { useDeleteOuting, useOuting } from '../hooks/useOutings';
import { OutingDetail } from './OutingDetail';
import { OutingsFrame, ScrollColumn } from './OutingsFrame';
import { OutingsStatus } from './OutingsStatus';

/** What went wrong deleting: announced as an alert under the outing, which stays. */
interface Failure {
  code: string;
  retryable: boolean;
}

/**
 * One outing (TG-629): its detail and, for its author only, the buttons to edit it and to
 * delete it, asking first. Who the author is comes from the session, not from the screen:
 * until it is known nobody gets the buttons, and the server has the last word (403).
 */
export function OutingDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const outing = useOuting(id);
  const me = useCurrentUser();
  const remove = useDeleteOuting();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const isAuthor = Boolean(outing.data && me.data && me.data.id === outing.data.author.id);

  async function confirmDelete() {
    try {
      await remove.mutateAsync(id);
      setConfirming(false);
      // Opened from a link there is no list to go back to: go to the outings of the person.
      if (router.canGoBack()) router.back();
      else router.replace('/outings');
    } catch (error) {
      setConfirming(false);
      setFailure(
        isAppError(error)
          ? { code: error.code, retryable: error.retryable }
          : { code: 'GENERIC_FINAL', retryable: false },
      );
    }
  }

  return (
    <OutingsFrame title={t('outings.myTitle')}>
      {(topInset) => (
        <>
          {outing.data && (
            <ScrollColumn topInset={topInset}>
              <View style={{ gap: spacing.md }}>
                <OutingDetail
                  outing={outing.data}
                  isAuthor={isAuthor}
                  onEdit={() => router.push(`/outings/${id}/edit`)}
                  onDelete={() => {
                    setFailure(null);
                    setConfirming(true);
                  }}
                />
                {failure ? (
                  <Text
                    accessibilityRole="alert"
                    style={[typography.body, { color: colors.state.danger }]}
                  >
                    {errorMessage(t, failure.code, failure.retryable)}
                  </Text>
                ) : null}
              </View>
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
          <ConfirmDialog
            visible={confirming}
            title={t('outings.delete.title')}
            message={t('outings.delete.message')}
            confirmLabel={t('outings.delete.confirm')}
            cancelLabel={t('outings.delete.cancel')}
            busy={remove.isPending}
            onConfirm={() => void confirmDelete()}
            onCancel={() => setConfirming(false)}
          />
        </>
      )}
    </OutingsFrame>
  );
}
