import { User } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonTab } from '../../features/navigation/components/ComingSoonTab';

export default function ProfileScreen() {
  const { t } = useTranslation();

  return (
    <ComingSoonTab
      title={t('comingSoon.profileTitle')}
      description={t('comingSoon.profileDesc')}
      icon={User}
    />
  );
}
