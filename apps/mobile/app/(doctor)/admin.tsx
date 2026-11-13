import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shared/screens/PlaceholderScreen';

/** Placeholder until the admin tools land (features/doctor/admin). */
export default function DoctorAdmin() {
  const { t } = useTranslation();
  return <PlaceholderScreen withTabBar title={t('tabs.admin')} icon="settings-outline" testID="screen-admin" />;
}
