import { ApodView } from '../../features/apod/components/ApodView';
import { useApodToday } from '../../features/apod/hooks/useApodToday';
import { SkyBackground } from '../../shared/ui';

/**
 * Today's APOD (TG-48). The page only orchestrates: data comes from the hook.
 * Loading and error states are TG-120; until then only the sky is shown.
 */
export default function ApodScreen() {
  const { data } = useApodToday();

  return <SkyBackground>{data ? <ApodView apod={data} /> : null}</SkyBackground>;
}
