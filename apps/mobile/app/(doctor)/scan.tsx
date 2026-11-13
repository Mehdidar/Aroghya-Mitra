import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { demoPayload, resolveScan } from '@/features/doctor/qrScan';
import { useTheme } from '@/features/shared/theme';
import { ErrorState, Heading, IconButton, PrimaryButton, Screen, SecondaryButton, Text, TextField } from '@/features/shared/ui';

/** Scan a patient's QR health card. Camera on native; paste or demo card on web / without permission. */
export default function ScanScreen() {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [payload, setPayload] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const canUseCamera = Platform.OS !== 'web' && permission?.granted;

  const resolve = async (text: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await resolveScan(text);
    setBusy(false);
    if (r.ok) {
      router.replace({ pathname: '/patient/[id]', params: { id: r.patientId, via: 'qr' } });
    } else {
      handled.current = false;
      setError(t(`scan.error.${r.reason}`));
    }
  };

  return (
    <Screen background="page" testID="screen-doctor-scan" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('back')} flipInRTL onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Heading variant="h2" style={{ flex: 1 }}>
          {t('scan.title')}
        </Heading>
      </View>
      <Text tone="secondary">{t('scan.body')}</Text>

      {canUseCamera ? (
        <View style={{ height: 320, borderRadius: theme.radii.xl, overflow: 'hidden', backgroundColor: theme.colors.surfaceInverse }} accessible accessibilityLabel={t('scan.cameraLabel')}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return;
              handled.current = true;
              void resolve(data);
            }}
          />
        </View>
      ) : Platform.OS !== 'web' && permission && !permission.granted ? (
        <View style={{ gap: theme.space[3] }}>
          <Text tone="secondary">{t('scan.permissionBody')}</Text>
          <SecondaryButton label={t('scan.allowCamera')} icon="camera-outline" onPress={() => void requestPermission()} />
        </View>
      ) : null}

      {error ? <ErrorState title={t('scan.failedTitle')} body={error} retryLabel={t('retry')} onRetry={() => setError(null)} testID="scan-error" /> : null}

      <View style={{ gap: theme.space[3] }}>
        <TextField label={t('scan.pasteLabel')} placeholder="AM1…" value={payload} onChangeText={setPayload} autoCapitalize="none" testID="scan-payload" />
        <PrimaryButton label={t('scan.open')} icon="open-outline" loading={busy} disabled={!payload.trim()} onPress={() => void resolve(payload)} testID="scan-submit" />
        <SecondaryButton label={t('scan.useDemo')} icon="flask-outline" onPress={() => void resolve(demoPayload())} testID="scan-demo" />
      </View>
    </Screen>
  );
}
