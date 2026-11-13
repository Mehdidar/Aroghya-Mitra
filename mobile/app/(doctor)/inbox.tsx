import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shared/screens/PlaceholderScreen';

export default function DoctorInbox() {
  const { t } = useTranslation();
  return <PlaceholderScreen withTabBar title={t('doctor.inboxTitle')} icon="mail-outline" owner="P4" testID="screen-doctor-inbox" />;
}
