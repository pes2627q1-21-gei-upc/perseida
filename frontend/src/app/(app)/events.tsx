import { useRouter } from 'expo-router';
import { Planet } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonTab } from '../../features/navigation/components/ComingSoonTab';

export default function EventsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <ComingSoonTab
      title={t('comingSoon.eventsTitle')}
      description={t('comingSoon.eventsDesc')}
      icon={Planet}
      action={{
        label: t('comingSoon.eventsMapButton'),
        onPress: () => router.push('/map'),
      }}
    />
  );
}
