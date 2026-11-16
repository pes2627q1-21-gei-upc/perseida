import { ApodStatus } from '../../features/apod/components/ApodStatus';
import { ApodView } from '../../features/apod/components/ApodView';
import { useApodToday } from '../../features/apod/hooks/useApodToday';
import { SkyBackground } from '../../shared/ui';

/**
 * Today's APOD (TG-48). The page only orchestrates: data comes from the hook.
 * Retrying after an error shows the loading state again until the new answer arrives.
 */
export default function ApodScreen() {
  const { data, error, isFetching, refetch } = useApodToday();

  let content;
  if (data) {
    content = <ApodView apod={data} />;
  } else if (error && !isFetching) {
    const onRetry = error.retryable ? () => void refetch() : undefined;
    content = <ApodStatus state="error" code={error.code} onRetry={onRetry} />;
  } else {
    content = <ApodStatus state="loading" />;
  }

  return <SkyBackground>{content}</SkyBackground>;
}
