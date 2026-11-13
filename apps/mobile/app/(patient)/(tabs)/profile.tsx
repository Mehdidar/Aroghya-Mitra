import { useTranslation } from 'react-i18next';

import { ProfileScreen } from '@/features/shared/screens/ProfileScreen';

export default function PatientProfile() {
  const { t } = useTranslation('patient');
  return <ProfileScreen note={t('profile.demoNote')} />;
}
