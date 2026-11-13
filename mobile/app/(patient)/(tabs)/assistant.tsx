import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shared/screens/PlaceholderScreen';

export default function PatientAssistant() {
  const { t } = useTranslation('patient');
  return <PlaceholderScreen withTabBar title={t('assistant.title')} body={t('assistant.body')} icon="sparkles-outline" owner="P2" testID="screen-patient-assistant" />;
}
