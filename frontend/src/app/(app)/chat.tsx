import { Chats } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';

import { ComingSoonTab } from '../../features/navigation/components/ComingSoonTab';

export default function ChatScreen() {
  const { t } = useTranslation();

  return (
    <ComingSoonTab
      title={t('comingSoon.chatTitle')}
      description={t('comingSoon.chatDesc')}
      icon={Chats}
    />
  );
}
