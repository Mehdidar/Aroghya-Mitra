import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { BookingFlow } from '@/features/appointments/BookingFlow';
import { useTheme } from '@/features/shared/theme';
import { Screen } from '@/features/shared/ui';

/**
 * Book or move a PHC appointment. Params: `rescheduleId` (move that
 * appointment), `patientId` + `patientName` (booking on someone's behalf).
 */
export default function BookAppointmentScreen() {
  useTranslation('appointments');
  const theme = useTheme();
  const { rescheduleId, patientId, patientName } = useLocalSearchParams<{ rescheduleId?: string; patientId?: string; patientName?: string }>();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/appointments' as Href));
  return (
    <Screen testID="screen-book-appointment" contentStyle={{ gap: theme.space[4] }}>
      <BookingFlow rescheduleId={rescheduleId ?? null} patientId={patientId ?? null} patientName={patientName ?? null} onBack={back} onDone={back} />
    </Screen>
  );
}
