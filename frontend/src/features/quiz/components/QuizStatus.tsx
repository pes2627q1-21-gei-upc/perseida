import { useTranslation } from 'react-i18next';

import { StatusPanel } from '../../../shared/ui';

/** `onRetry` is only given for retryable errors (gestio-errors): the rest show just the message. */
type Props = { state: 'loading' } | { state: 'error'; code: string; onRetry?: () => void };

/** Loading and error states of the quiz screen (TG-61, criterion 7), on the shared StatusPanel. */
export function QuizStatus(props: Props) {
  const { t } = useTranslation();
  const texts = {
    loadingLabel: t('quiz.loadingLabel'),
    retry: t('quiz.retry'),
    retryHint: t('quiz.retryHint'),
  };
  return <StatusPanel texts={texts} {...props} />;
}
