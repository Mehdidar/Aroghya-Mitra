import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, View } from 'react-native';

import {
  BENGALURU_CENTRE,
  BLOOD_COMPONENTS,
  BLOOD_GROUPS,
  createBloodBankService,
  directionsUrl,
  formatDistance,
  formatUpdatedAgo,
  telUrl,
  type BloodBankResult,
  type BloodComponent,
  type BloodGroup,
  type LatLng,
} from '@am/records';

import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, ErrorState, Heading, Icon, IconButton, Pill, Screen, SecondaryButton, Skeleton, Text } from '@/features/shared/ui';

const service = createBloodBankService();

async function deviceLocation(): Promise<LatLng | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Location = require('expo-location') as { requestForegroundPermissionsAsync: () => Promise<{ granted: boolean }>; getCurrentPositionAsync: (o: { accuracy?: number }) => Promise<{ coords: { latitude: number; longitude: number } }> };
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm?.granted) return null;
    const pos = await Location.getCurrentPositionAsync({});
    return pos?.coords ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: t.sizes.touchMin,
        paddingHorizontal: t.space[4],
        justifyContent: 'center',
        borderRadius: t.radii.full,
        backgroundColor: selected ? t.colors.primary : t.colors.surface,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.border,
      }}>
      <Text variant="bodySmall" weight="semibold" color={selected ? t.colors.onPrimary : t.colors.textPrimary} numeric>
        {label}
      </Text>
    </Pressable>
  );
}

/** Blood bank finder over the mock Bengaluru data. Stock and phone numbers are demo values, and say so. */
export default function BloodBanksScreen() {
  const { t } = useTranslation('health');
  const theme = useTheme();
  const [group, setGroup] = useState<BloodGroup | undefined>('B+');
  const [component, setComponent] = useState<BloodComponent | undefined>('prbc');
  const [near, setNear] = useState<LatLng>(BENGALURU_CENTRE);
  const [located, setLocated] = useState(false);
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ready'; results: BloodBankResult[] } | { kind: 'error' }>({ kind: 'loading' });
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let alive = true;
    void deviceLocation().then((loc) => {
      if (alive && loc) {
        setNear(loc);
        setLocated(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    service
      .search({ bloodGroup: group, component, near, sort: 'distance' }, now)
      .then((results) => alive && setState({ kind: 'ready', results }))
      .catch(() => alive && setState({ kind: 'error' }));
    return () => {
      alive = false;
    };
  }, [group, component, near, now]);

  return (
    <Screen testID="screen-blood-banks" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('common:actions.back', { defaultValue: 'Back' })} onPress={() => (router.canGoBack() ? router.back() : router.replace('/health'))} flipInRTL />
        <Heading variant="h2" style={{ flex: 1 }}>
          {t('blood.title')}
        </Heading>
      </View>

      <Card tone="muted" radius="xl" padding="md" testID="blood-mock-banner">
        <View style={{ flexDirection: 'row', gap: theme.space[2], alignItems: 'flex-start' }}>
          <Icon name="information-circle" size={theme.sizes.icon.sm} color={theme.colors.status.warning.icon} />
          <Text variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
            {t('blood.mockBanner')}
          </Text>
        </View>
      </Card>

      <View style={{ gap: theme.space[2] }}>
        <Text variant="label" tone="secondary">
          {t('blood.group')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space[2] }}>
          {BLOOD_GROUPS.map((g) => (
            <Chip key={g} label={g} selected={group === g} onPress={() => setGroup(group === g ? undefined : g)} testID={`group-${g}`} />
          ))}
        </ScrollView>
        <Text variant="label" tone="secondary">
          {t('blood.component')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space[2] }}>
          {BLOOD_COMPONENTS.map((c) => (
            <Chip key={c.key} label={c.short} selected={component === c.key} onPress={() => setComponent(component === c.key ? undefined : c.key)} testID={`component-${c.key}`} />
          ))}
        </ScrollView>
        <Text variant="caption" tone="tertiary">
          {located ? t('blood.nearYou') : t('blood.nearCentre')}
        </Text>
      </View>

      {state.kind === 'loading' ? (
        <View style={{ gap: theme.space[3] }}>
          <Skeleton height={120} radius={theme.radii.xl} />
          <Skeleton height={120} radius={theme.radii.xl} />
        </View>
      ) : state.kind === 'error' ? (
        <ErrorState title={t('blood.errorTitle')} retryLabel={t('common:actions.retry', { defaultValue: 'Try again' })} onRetry={() => setNear({ ...near })} />
      ) : state.results.length === 0 ? (
        <EmptyState icon="water-outline" title={t('blood.emptyTitle')} body={t('blood.emptyBody')} testID="blood-empty" />
      ) : (
        <View style={{ gap: theme.space[3] }} testID="blood-list">
          {state.results.map((r) => (
            <Card key={r.bank.id} radius="xl" padding="lg" testID={`bank-${r.bank.id}`}>
              <View style={{ gap: theme.space[3] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space[2] }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{r.bank.name}</Text>
                    <Text variant="caption" tone="tertiary">
                      {`${r.bank.area} · ${t(`blood.category.${r.bank.category}`)}${r.bank.open24x7 ? ` · ${t('blood.open24x7')}` : ''}`}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" numeric>
                    {formatDistance(r.distanceKm)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap' }}>
                  <Pill label={t('blood.units', { count: r.unitsAvailable })} tone={r.unitsAvailable > 0 ? 'success' : 'danger'} icon="water" />
                  <Pill label={t(r.isStale ? 'blood.stale' : 'blood.updated', { ago: formatUpdatedAgo(r.lastUpdated, now) })} tone={r.isStale ? 'warning' : 'neutral'} icon="time-outline" />
                  <Pill label={t('blood.demoNumber')} tone="warning" icon="flask-outline" />
                </View>
                <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
                  {r.bank.phone ? <SecondaryButton label={t('blood.call')} icon="call-outline" onPress={() => void Linking.openURL(telUrl(r.bank.phone!))} style={{ flex: 1 }} /> : null}
                  <SecondaryButton label={t('blood.directions')} icon="navigate-outline" onPress={() => void Linking.openURL(directionsUrl(r.bank.location))} style={{ flex: 1 }} />
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
