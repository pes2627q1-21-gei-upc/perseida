import { useTranslation } from 'react-i18next';

import { TopBar } from '../../../shared/ui';

interface Props {
  onBack: () => void;
  /** Reports the height the bar covers from the top, so the list can start under it. */
  onLayout?: (bottom: number) => void;
}

/** Floating glass bar of the events map (TG-52): back and screen title. */
export function MapTopBar({ onBack, onLayout }: Props) {
  const { t } = useTranslation();
  return (
    <TopBar
      title={t('events.map.title')}
      testID="map-top-bar"
      onBack={onBack}
      onLayout={onLayout}
    />
  );
}
