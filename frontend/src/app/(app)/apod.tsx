import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApodStatus } from '../../features/apod/components/ApodStatus';
import { ApodView } from '../../features/apod/components/ApodView';
import { useApodToday } from '../../features/apod/hooks/useApodToday';
import { SkyBackground, TopBar } from '../../shared/ui';

/**
 * Today's APOD (TG-48). The page only orchestrates: data comes from the hook.
 * Retrying after an error shows the loading state again until the new answer arrives.
 */
export default function ApodScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [barBottom, setBarBottom] = useState(0);
  const { data, error, isFetching, refetch } = useApodToday();

  let content;
  if (data) {
    content = <ApodView apod={data} topInset={barBottom} />;
  } else if (error && !isFetching) {
    const onRetry = error.retryable ? () => void refetch() : undefined;
    content = <ApodStatus state="error" code={error.code} onRetry={onRetry} />;
  } else {
    content = <ApodStatus state="loading" />;
  }

  function goBack() {
    // Opened from a link there is nowhere to go back to: go home instead.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SkyBackground>
      {content}
      <TopBar
        title={t('apod.title')}
        testID="apod-top-bar"
        onBack={goBack}
        onLayout={setBarBottom}
      />
    </SkyBackground>
  );
}
