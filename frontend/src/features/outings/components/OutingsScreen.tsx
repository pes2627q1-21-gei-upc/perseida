import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../shared/theme';
import { GelButton } from '../../../shared/ui';
import { useOutings } from '../hooks/useOutings';
import { OutingList } from './OutingList';
import { OutingsFrame } from './OutingsFrame';
import { OutingsStatus } from './OutingsStatus';

/**
 * The outings of the person (`/outings`) or of an event (`/outings?eventId=`) (TG-629): the
 * list with its loading, empty and error states, and the way to create a new one, linked to
 * the event if the list is the one of an event. The page only orchestrates.
 */
export function OutingsScreen({ eventId }: { eventId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const outings = useOutings(eventId ? { eventId } : { mine: true });

  function create() {
    if (eventId) router.push({ pathname: '/outings/new', params: { eventId } });
    else router.push('/outings/new');
  }

  return (
    <OutingsFrame title={t(eventId ? 'outings.eventTitle' : 'outings.myTitle')}>
      {(topInset) => (
        <View style={styles.fill}>
          <View style={styles.fill}>
            {outings.data && outings.data.length > 0 && (
              <OutingList
                outings={outings.data}
                label={t('outings.list.label')}
                topInset={topInset}
                onSelect={(id) => router.push(`/outings/${id}`)}
              />
            )}
            {outings.data?.length === 0 && (
              <OutingsStatus
                state="empty"
                message={t(eventId ? 'outings.empty.event' : 'outings.empty.mine')}
              />
            )}
            {outings.isPending && <OutingsStatus state="loading" />}
            {outings.isError && (
              <OutingsStatus
                state="error"
                code={outings.error.code}
                onRetry={outings.error.retryable ? () => void outings.refetch() : undefined}
              />
            )}
          </View>
          {outings.isSuccess && (
            <View
              style={[
                styles.actions,
                { padding: spacing.md, paddingBottom: insets.bottom + spacing.md },
              ]}
            >
              <GelButton label={t('outings.new')} onPress={create} />
            </View>
          )}
        </View>
      )}
    </OutingsFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { alignItems: 'center' },
});
