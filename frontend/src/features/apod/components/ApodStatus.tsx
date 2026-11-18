import { useTranslation } from 'react-i18next';

import { StatusPanel } from '../../../shared/ui';

/** `onRetry` is only given for retryable errors (gestio-errors): the rest show just the message. */
type Props = { state: 'loading' } | { state: 'error'; code: string; onRetry?: () => void };

/** Loading and error states of the APOD screen (TG-120), on the shared StatusPanel. */
export function ApodStatus(props: Props) {
  const { t } = useTranslation();
  const texts = {
    loadingLabel: t('apod.loadingLabel'),
    retry: t('apod.retry'),
    retryHint: t('apod.retryHint'),
  };
  return <StatusPanel texts={texts} {...props} />;
}
