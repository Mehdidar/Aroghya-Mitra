import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { QrCodeView } from '@/features/health/QrCodeView';
import { useQrCard } from '@/features/health/useQrCard';
import { useCurrentUser } from '@/features/shared/state/session';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, ErrorState, Heading, IconButton, Pill, PrimaryButton, Screen, SecondaryButton, Skeleton, Text } from '@/features/shared/ui';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';

/** The QR health card: a short-lived code a doctor scans to open this patient's history. */
export default function QrCardScreen() {
  const { t } = useTranslation('health');
  const theme = useTheme();
  const user = useCurrentUser();
  const shareHistory = useRecords((s) => s.shareHistory);
  const setShareHistory = useRecords((s) => s.setShareHistory);
  const qr = useQrCard({ shareHistory });

  return (
    <Screen background="hero" testID="screen-qr-card" contentStyle={{ gap: theme.space[5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('common:actions.back', { defaultValue: 'Back' })} onPress={() => (router.canGoBack() ? router.back() : router.replace('/health'))} flipInRTL />
        <Heading variant="h2">{t('qr.title')}</Heading>
      </View>
      <ScreenGuide id="qrCard" />

      <Card radius="xxl" padding="lg">
        <View style={{ alignItems: 'center', gap: theme.space[4] }}>
          <Text variant="title">{user?.name}</Text>
          {qr.kind === 'loading' ? (
            <Skeleton width={240} height={240} radius={theme.radii.lg} />
          ) : qr.kind === 'paused' ? (
            <EmptyState icon="eye-off-outline" title={t('qr.pausedTitle')} body={t('qr.pausedBody')} action={<PrimaryButton label={t('qr.turnOn')} onPress={() => setShareHistory(true)} />} testID="qr-paused" />
          ) : qr.kind === 'error' ? (
            <ErrorState title={t('qr.errorTitle')} body={qr.message} retryLabel={t('common:actions.retry', { defaultValue: 'Try again' })} onRetry={qr.refresh} testID="qr-error" />
          ) : (
            <>
              <QrCodeView value={qr.qr.payload} testID="qr-code" />
              <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap', justifyContent: 'center' }}>
                {qr.mode === 'offline' ? (
                  <Pill label={t('qr.offlineDemo')} tone="warning" icon="cloud-offline-outline" />
                ) : qr.mode === 'server-demo' ? (
                  <Pill label={t('qr.serverDemo')} tone="info" icon="flask-outline" />
                ) : (
                  <Pill label={t('qr.live')} tone="success" icon="shield-checkmark-outline" />
                )}
                <Pill label={t('qr.refreshesIn', { time: qr.countdown })} tone="neutral" icon="time-outline" />
              </View>
              <Text variant="bodySmall" tone="secondary" align="center">
                {t('qr.howTo')}
              </Text>
            </>
          )}
        </View>
      </Card>

      <Card tone="muted" radius="xl" padding="lg">
        <View style={{ gap: theme.space[2] }}>
          <Text variant="bodyStrong">{t('qr.privacyTitle')}</Text>
          <Text variant="bodySmall" tone="secondary">
            {t('qr.privacyBody')}
          </Text>
          {shareHistory && qr.kind === 'ready' ? <SecondaryButton label={t('qr.pause')} icon="pause-circle-outline" onPress={() => setShareHistory(false)} /> : null}
        </View>
      </Card>
    </Screen>
  );
}
