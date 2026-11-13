import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { formatDistance } from '@am/records';

import { callUrl, directionsUrlFor, KIND_COLOURS, LeafletMap, useDeviceLocation, useNearbyPlaces, type MapPlace, type MapPlaceKind } from '@/features/maps';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, ErrorState, Heading, Icon, IconButton, Pill, Screen, Skeleton, Text, type IconName } from '@/features/shared/ui';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';
import { useFabInset } from '@/features/shared/ui';

type Filter = 'all' | MapPlaceKind;
const FILTERS: Filter[] = ['all', 'hospital', 'clinic', 'pharmacy', 'bloodbank'];

function Chip({ label, selected, onPress, colour, testID }: { label: string; selected: boolean; onPress: () => void; colour?: string; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: t.sizes.touchMin,
        paddingHorizontal: t.space[4],
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        borderRadius: t.radii.full,
        backgroundColor: selected ? t.colors.primary : t.colors.surface,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.border,
      }}>
      {colour ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colour, borderWidth: 1, borderColor: t.colors.surface }} /> : null}
      <Text variant="bodySmall" weight="semibold" color={selected ? t.colors.onPrimary : t.colors.textPrimary}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Secondary-style button that carries its own accessibilityLabel ("Call <name>", not just "Call"). */
function RowAction({ label, a11yLabel, icon, onPress, testID }: { label: string; a11yLabel: string; icon: IconName; onPress: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: t.sizes.touchMin,
        borderRadius: t.radii.full,
        backgroundColor: pressed ? t.colors.tertiaryButton : t.colors.secondary,
        borderWidth: 1,
        borderColor: t.colors.secondaryBorder,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space[2],
        paddingHorizontal: t.space[4],
      })}>
      <Icon name={icon} color={t.colors.onSecondary} size={t.sizes.icon.sm} />
      <Text variant="label" color={t.colors.onSecondary}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Nearby care: real hospitals, clinics and pharmacies from OpenStreetMap around the user, plus
 * the app's blood banks, on a street map with a list below. The list is the accessible view;
 * the map is hidden from screen readers. The fictional indoor guide stays at /hospital.
 */
export default function NearbyScreen() {
  const { t } = useTranslation('maps');
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const { location, located } = useDeviceLocation();
  const nearby = useNearbyPlaces(location);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const fabInset = useFabInset();
  const rowY = useRef<Record<string, number>>({});

  const nameOf = useCallback((p: MapPlace) => p.name || t(`unnamed.${p.kind}`), [t]);
  const visible = useMemo(() => {
    const list = filter === 'all' ? nearby.places : nearby.places.filter((p) => p.kind === filter);
    return list.map((p) => ({ ...p, name: nameOf(p) }));
  }, [nearby.places, filter, nameOf]);

  const onMarker = useCallback((id: string) => {
    setSelectedId(id);
    const y = rowY.current[id];
    if (y !== undefined) listRef.current?.scrollTo({ y: Math.max(0, y - theme.space[2]), animated: true });
  }, [theme.space]);

  const mapHeight = Math.round(Math.min(480, Math.max(220, height * 0.45)));
  const loading = !location || nearby.status === 'loading';

  return (
    <Screen testID="screen-nearby" scroll={false} contentStyle={{ gap: theme.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('common:actions.back', { defaultValue: 'Back' })} onPress={() => (router.canGoBack() ? router.back() : router.replace('/health'))} flipInRTL />
        <Heading variant="h2" style={{ flex: 1 }}>
          {t('title')}
        </Heading>
      </View>
      <ScreenGuide id="nearby" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: theme.space[2] }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={t(`filters.${f}`)} selected={filter === f} onPress={() => setFilter(f)} colour={f === 'all' ? undefined : KIND_COLOURS[f]} testID={`filter-${f}`} />
        ))}
      </ScrollView>

      <Text variant="caption" tone="tertiary" testID="nearby-location-note">
        {!location ? t('locating') : located ? t('nearYou') : t('fallbackNote')}
      </Text>

      <LeafletMap
        places={visible}
        user={location}
        selectedId={selectedId}
        onSelect={onMarker}
        accessibilityLabel={t('mapA11y')}
        style={{ height: mapHeight, borderRadius: theme.radii.xl, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSunken }}
        testID="nearby-map"
      />

      <ScrollView ref={listRef} style={{ flex: 1 }} contentContainerStyle={{ gap: theme.space[3], paddingBottom: theme.space[4] + fabInset }} testID="nearby-scroll">
        {nearby.status === 'error' ? (
          <ErrorState title={t('errorTitle')} body={t('errorBody')} retryLabel={t('common:actions.retry', { defaultValue: 'Try again' })} onRetry={nearby.retry} testID="nearby-error" />
        ) : null}

        {loading ? (
          <View style={{ gap: theme.space[3] }} testID="nearby-loading">
            <Skeleton height={112} radius={theme.radii.xl} />
            <Skeleton height={112} radius={theme.radii.xl} />
            <Skeleton height={112} radius={theme.radii.xl} />
          </View>
        ) : visible.length === 0 ? (
          nearby.status === 'error' ? null : <EmptyState icon="medkit-outline" title={t('emptyTitle')} body={t('emptyBody')} testID="nearby-empty" />
        ) : (
          visible.map((p) => {
            const selected = p.id === selectedId;
            const meta = [t(`kind.${p.kind}`), p.distanceKm !== null ? formatDistance(p.distanceKm) : null, p.open24x7 ? t('open24x7') : null, p.emergency ? t('emergency') : null].filter(Boolean).join(' · ');
            return (
              <View
                key={p.id}
                onLayout={(e) => {
                  rowY.current[p.id] = e.nativeEvent.layout.y;
                }}>
                <Card
                  radius="xl"
                  padding="lg"
                  testID={`place-${p.id}`}
                  style={selected ? { borderWidth: 2, borderColor: theme.colors.primary } : undefined}>
                  <View style={{ gap: theme.space[3] }}>
                    <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' }}>
                      <View style={{ width: 12, height: 12, marginTop: 6, borderRadius: 6, backgroundColor: KIND_COLOURS[p.kind] }} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="bodyStrong">{p.name}</Text>
                        <Text variant="caption" tone="tertiary">
                          {meta}
                        </Text>
                        {p.address ? (
                          <Text variant="caption" tone="tertiary" numberOfLines={2}>
                            {p.address}
                          </Text>
                        ) : null}
                      </View>
                      {p.demo ? <Pill label={t('demo')} tone="warning" icon="flask-outline" /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
                      {p.phone ? (
                        <RowAction label={t('call')} a11yLabel={t('callA11y', { name: p.name })} icon="call-outline" onPress={() => void Linking.openURL(callUrl(p.phone!))} testID={`call-${p.id}`} />
                      ) : null}
                      <RowAction
                        label={t('directions')}
                        a11yLabel={t('directionsA11y', { name: p.name })}
                        icon="navigate-outline"
                        onPress={() => void Linking.openURL(directionsUrlFor(Platform.OS, p))}
                        testID={`directions-${p.id}`}
                      />
                    </View>
                  </View>
                </Card>
              </View>
            );
          })
        )}

        <Text variant="caption" tone="tertiary" testID="nearby-credit">
          {t('credit')}
        </Text>

        <Card radius="xl" padding="lg" tone="muted" onPress={() => router.push('/hospital')} accessibilityLabel={t('indoorA11y')} testID="nearby-indoor">
          <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'center', minHeight: theme.sizes.touchMin }}>
            <Icon name="map-outline" size={theme.sizes.icon.md} color={theme.colors.textPrimary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{t('indoorTitle')}</Text>
              <Text variant="caption" tone="tertiary">
                {t('indoorBody')}
              </Text>
            </View>
            <Icon name="chevron-forward" size={theme.sizes.icon.sm} color={theme.colors.textSecondary} flipInRTL />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
