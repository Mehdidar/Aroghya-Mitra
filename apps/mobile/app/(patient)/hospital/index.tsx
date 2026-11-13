import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { DEMO_HOSPITAL, DESTINATIONS, ENTRANCES, FloorMap, buildRoute, parseEntranceQr, useReadAloud, walkMinutes, type RouteStep } from '@/features/hospital';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, Heading, Icon, IconButton, Pill, PrimaryButton, Screen, SecondaryButton, Text, type IconName } from '@/features/shared/ui';

const STEP_ICON: Record<RouteStep['kind'], IconName> = { start: 'flag-outline', walk: 'walk-outline', lift: 'arrow-up-circle-outline', stairs: 'trending-up-outline', arrive: 'location' };

type CameraModule = {
  CameraView: React.ComponentType<{ style: object; facing: 'back'; barcodeScannerSettings: object; onBarcodeScanned: (e: { data: string }) => void }>;
  useCameraPermissions: () => [{ granted: boolean } | null, () => Promise<{ granted: boolean }>];
};

function loadCamera(): CameraModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-camera') as CameraModule;
  } catch {
    return null;
  }
}

function EntranceScanner({ onFound, onCancel }: { onFound: (nodeId: string) => void; onCancel: () => void }) {
  const { t } = useTranslation('hospital');
  const Camera = useMemo(loadCamera, []);
  if (!Camera) return <EmptyState icon="camera-outline" title={t('scan.unavailable')} body={t('scan.pickInstead')} action={<SecondaryButton label={t('scan.close')} onPress={onCancel} />} />;
  return <NativeScanner Camera={Camera} onFound={onFound} onCancel={onCancel} />;
}

function NativeScanner({ Camera, onFound, onCancel }: { Camera: CameraModule; onFound: (id: string) => void; onCancel: () => void }) {
  const { t } = useTranslation('hospital');
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [perm, request] = Camera.useCameraPermissions();
  if (!perm?.granted) {
    return (
      <EmptyState
        icon="camera-outline"
        title={t('scan.permissionTitle')}
        body={t('scan.permissionBody')}
        action={
          <View style={{ gap: theme.space[2] }}>
            <PrimaryButton label={t('scan.allow')} onPress={() => void request()} />
            <SecondaryButton label={t('scan.close')} onPress={onCancel} />
          </View>
        }
      />
    );
  }
  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={{ height: 280, borderRadius: theme.radii.xl, overflow: 'hidden' }}>
        <Camera.CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            const node = parseEntranceQr(data);
            if (node) onFound(node);
            else setError(t('scan.notEntrance'));
          }}
        />
      </View>
      {error ? <Text tone="secondary">{error}</Text> : null}
      <SecondaryButton label={t('scan.close')} onPress={onCancel} />
    </View>
  );
}

/** Indoor navigation for the demo hospital: entrance (QR or picker) → destination → map + spoken steps. */
export default function HospitalNavigation() {
  const { t } = useTranslation('hospital');
  const theme = useTheme();
  const { language: code } = useLanguage();
  const [start, setStart] = useState<string>('main_entrance');
  const [dest, setDest] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [floor, setFloor] = useState(0);
  const route = useMemo(() => (dest ? buildRoute(start, dest) : null), [start, dest]);
  const { speak, stop, speaking } = useReadAloud(code);

  const stepText = (s: RouteStep) => {
    const place = s.label ? t(`places.${s.label}`) : '';
    const floorName = (f: number) => t(`floors.${DEMO_HOSPITAL.floors[f]?.label ?? f}`);
    switch (s.kind) {
      case 'start':
        return t('steps.start', { place });
      case 'walk':
        return s.turn && s.turn !== 'straight' ? t('steps.walkTurn', { metres: s.metres, turn: t(`turns.${s.turn}`), place: place || t('steps.corridor') }) : t('steps.walk', { metres: s.metres, place: place || t('steps.corridor') });
      case 'lift':
        return t('steps.lift', { floor: floorName(s.toFloor ?? s.floor) });
      case 'stairs':
        return t('steps.stairs', { floor: floorName(s.toFloor ?? s.floor) });
      case 'arrive':
        return t('steps.arrive', { place, metres: s.metres });
    }
  };

  const routeFloors = route ? Object.keys(route.byFloor).map(Number) : [0];
  const shownFloor = routeFloors.includes(floor) ? floor : routeFloors[0];

  return (
    <Screen testID="screen-hospital" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('common:actions.back', { defaultValue: 'Back' })} onPress={() => (router.canGoBack() ? router.back() : router.replace('/health'))} flipInRTL />
        <View style={{ flex: 1 }}>
          <Heading variant="h2">{t('title')}</Heading>
          <Text variant="bodySmall" tone="secondary">
            {t('hospitalName')}
          </Text>
        </View>
        <Pill label={t('common:demo.badge')} tone="warning" icon="flask-outline" />
      </View>

      {scanning ? (
        <Card radius="xl" padding="lg">
          <EntranceScanner
            onFound={(id) => {
              setStart(id);
              setScanning(false);
            }}
            onCancel={() => setScanning(false)}
          />
        </Card>
      ) : (
        <Card radius="xl" padding="lg" testID="start-picker">
          <View style={{ gap: theme.space[3] }}>
            <Text variant="label" tone="secondary">
              {t('start.label')}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap' }}>
              {ENTRANCES.map((id) => {
                const node = DEMO_HOSPITAL.nodes.find((n) => n.id === id)!;
                const selected = start === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setStart(id)}
                    testID={`start-${id}`}
                    style={{ minHeight: theme.sizes.touchMin, paddingHorizontal: theme.space[4], justifyContent: 'center', borderRadius: theme.radii.full, backgroundColor: selected ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: selected ? theme.colors.primary : theme.colors.border }}>
                    <Text variant="bodySmall" weight="semibold" color={selected ? theme.colors.onPrimary : theme.colors.textPrimary}>
                      {t(`places.${node.label}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <SecondaryButton label={t('scan.button')} icon="qr-code-outline" onPress={() => setScanning(true)} testID="scan-entrance" />
          </View>
        </Card>
      )}

      <View style={{ gap: theme.space[2] }}>
        <Text variant="label" tone="secondary">
          {t('dest.label')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space[2] }}>
          {DESTINATIONS.map((id) => {
            const node = DEMO_HOSPITAL.nodes.find((n) => n.id === id)!;
            const selected = dest === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setDest(id);
                  setFloor(DEMO_HOSPITAL.nodes.find((n) => n.id === start)?.floor ?? 0);
                }}
                testID={`dest-${id}`}
                style={{ minHeight: theme.sizes.touchMin, paddingHorizontal: theme.space[4], justifyContent: 'center', borderRadius: theme.radii.full, backgroundColor: selected ? theme.accent.accent : theme.colors.surface, borderWidth: 1, borderColor: selected ? theme.accent.accent : theme.colors.border }}>
                <Text variant="bodySmall" weight="semibold" color={selected ? theme.accent.onAccent : theme.colors.textPrimary}>
                  {t(`places.${node.label}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {!route ? (
        <EmptyState icon="map-outline" title={t('empty.title')} body={t('empty.body')} testID="route-empty" />
      ) : (
        <>
          <Card radius="xl" padding="md" testID="route-summary">
            <View style={{ gap: theme.space[3] }}>
              <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap' }}>
                <Pill label={t('summary.distance', { metres: route.metres })} tone="info" icon="walk-outline" />
                <Pill label={t('summary.minutes', { count: walkMinutes(route.metres) })} tone="neutral" icon="time-outline" />
                <Pill label={t('summary.floors', { count: routeFloors.length })} tone="neutral" icon="layers-outline" />
              </View>
              <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
                {routeFloors.map((f) => (
                  <Pressable
                    key={f}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: shownFloor === f }}
                    onPress={() => setFloor(f)}
                    testID={`floor-${f}`}
                    style={{ minHeight: theme.sizes.touchMin, paddingHorizontal: theme.space[4], justifyContent: 'center', borderRadius: theme.radii.full, backgroundColor: shownFloor === f ? theme.colors.primary : theme.colors.surfaceMuted }}>
                    <Text variant="bodySmall" weight="semibold" color={shownFloor === f ? theme.colors.onPrimary : theme.colors.textPrimary}>
                      {t(`floors.${DEMO_HOSPITAL.floors[f]?.label ?? f}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <FloorMap floor={shownFloor} route={route} testID={`floor-map-${shownFloor}`} />
            </View>
          </Card>

          <Card radius="xl" padding="lg" testID="route-steps">
            <View style={{ gap: theme.space[3] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="h3">{t('steps.title')}</Text>
                <SecondaryButton label={speaking ? t('steps.stop') : t('steps.readAloud')} icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'} onPress={() => (speaking ? stop() : speak(route.steps.map(stepText)))} testID="read-aloud" />
              </View>
              {route.steps.map((s, i) => (
                <View key={`${s.nodeId}-${i}`} style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' }} accessible accessibilityLabel={`${i + 1}. ${stepText(s)}`} testID={`step-${i}`}>
                  <View style={{ width: 36, height: 36, borderRadius: theme.radii.full, backgroundColor: theme.accent.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={STEP_ICON[s.kind]} size={theme.sizes.icon.sm} color={theme.accent.accentIcon} />
                  </View>
                  <Text style={{ flex: 1, paddingTop: 6 }}>{stepText(s)}</Text>
                </View>
              ))}
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}
