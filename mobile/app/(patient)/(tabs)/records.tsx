import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shared/screens/PlaceholderScreen';

export default function PatientRecords() {
  const { t } = useTranslation('patient');
  return <PlaceholderScreen withTabBar title={t('records.title')} body={t('records.body')} icon="document-text-outline" owner="P4" testID="screen-patient-records" />;
}
