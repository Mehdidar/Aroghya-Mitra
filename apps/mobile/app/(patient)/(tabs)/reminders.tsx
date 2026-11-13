import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shared/screens/PlaceholderScreen';

/** Placeholder until the dose timeline lands (features/patient/reminders). */
export default function PatientReminders() {
  const { t } = useTranslation();
  return <PlaceholderScreen withTabBar title={t('tabs.reminders')} icon="alarm-outline" testID="screen-reminders" />;
}
