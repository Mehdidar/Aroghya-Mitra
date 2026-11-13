import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shared/screens/PlaceholderScreen';

export default function DoctorPatients() {
  const { t } = useTranslation();
  return <PlaceholderScreen withTabBar title={t('doctor.patientsTitle')} icon="people-outline" owner="P4" testID="screen-doctor-patients" />;
}
