import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppointmentsList } from '@/features/appointments/AppointmentsList';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';
import { useTheme } from '@/features/shared/theme';
import { Heading, IconButton, Screen, Text } from '@/features/shared/ui';

/**
 * Patient: my PHC appointments (upcoming, with reschedule / cancel) and past
 * visits, which double as consultation history. Real data only: with nothing
 * booked it says so.
 */
export default function AppointmentsScreen() {
  const { t } = useTranslation('appointments');
  const theme = useTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => setRefreshKey((k) => k + 1), []));

  return (
    <Screen testID="screen-appointments" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('actions.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} flipInRTL />
        <View style={{ flex: 1 }}>
          <Heading variant="h2">{t('title')}</Heading>
          <Text tone="secondary" variant="bodySmall">
            {t('subtitle')}
          </Text>
        </View>
      </View>
      <ScreenGuide id="appointments" />
      <AppointmentsList
        refreshKey={refreshKey}
        onBook={() => router.push('/appointments/book' as Href)}
        onReschedule={(a) => router.push({ pathname: '/appointments/book', params: { rescheduleId: a.id } } as unknown as Href)}
      />
    </Screen>
  );
}
