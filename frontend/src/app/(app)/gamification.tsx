import { Trophy } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonTab } from '../../features/navigation/components/ComingSoonTab';

export default function GamificationScreen() {
  const { t } = useTranslation();

  return (
    <ComingSoonTab
      title={t('comingSoon.gamificationTitle')}
      description={t('comingSoon.gamificationDesc')}
      icon={Trophy}
    />
  );
}
