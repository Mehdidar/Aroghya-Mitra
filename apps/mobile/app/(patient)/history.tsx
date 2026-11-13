import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { HistoryView } from '@/features/health/HistoryView';
import { usePatientHistory } from '@/features/health/useHistory';
import { useTheme } from '@/features/shared/theme';
import { Heading, IconButton, Pill, Screen, Skeleton } from '@/features/shared/ui';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';

/** The patient's full history: what a doctor sees after scanning the QR card. */
export default function HistoryScreen() {
  const { t } = useTranslation('health');
  const theme = useTheme();
  const history = usePatientHistory();
  return (
    <Screen testID="screen-history" contentStyle={{ gap: theme.space[5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('common:actions.back', { defaultValue: 'Back' })} onPress={() => (router.canGoBack() ? router.back() : router.replace('/health'))} flipInRTL />
        <Heading variant="h2" style={{ flex: 1 }}>
          {t('history.title')}
        </Heading>
        <Pill label={t('common:demo.badge')} tone="warning" icon="flask-outline" />
      </View>
      <ScreenGuide id="history" />
      {history ? (
        <HistoryView history={history} testID="history-view" />
      ) : (
        <View style={{ gap: theme.space[3] }}>
          <Skeleton height={80} radius={theme.radii.xl} />
          <Skeleton height={200} radius={theme.radii.xl} />
        </View>
      )}
    </Screen>
  );
}
