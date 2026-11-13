import { router, Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PatientRow } from '../../../features/asha/components/PatientRow';
import { Chip, ChipScroll } from '../../../features/asha/components/ui';
import { followUpsDue, formatDate, latestVisitByPatient } from '../../../features/asha/logic/clinical';
import { SEVERITY_RANK } from '../../../features/asha/logic/rules';
import { useAsha, type SyncStatus } from '../../../features/asha/store/AshaContext';
import type { Lang, PatientCategory } from '../../../features/asha/types';
import { useTheme } from '../../../features/shared/theme';
import {
  Avatar,
  EmptyState,
  Glass,
  Icon,
  IconButton,
  Pill,
  PrimaryButton,
  SearchBar,
  SectionHeader,
  Text,
  type IconName,
  type PillTone,
} from '../../../features/shared/ui';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';

const FILTERS: (PatientCategory | 'all' | 'due')[] = ['all', 'due', 'pregnant', 'newborn', 'ncd', 'tb', 'elderly'];

type T = (k: string, p?: Record<string, string | number>) => string;

function todayLabel(lang: Lang): string {
  try {
    return new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return formatDate(new Date().toISOString());
  }
}

export default function AshaHome() {
  const { ready, db, user, lang, t, sync, syncNow, store } = useAsha();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  const visits = useMemo(() => Object.values(db.visits), [db.visits]);
  const lastVisit = useMemo(() => latestVisitByPatient(visits), [visits]);
  const due = useMemo(() => new Set(followUpsDue(visits).map((v) => v.patientId)), [visits]);
  const openAlerts = useMemo(() => store.currentAlerts().filter((a) => !a.acknowledged), [db.alerts, db.visits, store]);
  const openReferrals = Object.values(db.referrals).filter((r) => r.status !== 'closed').length;

  const patients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(db.patients)
      .filter((p) => p.assignedAshaId === user.id || !p.assignedAshaId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.village.toLowerCase().includes(q) || p.phone?.includes(q))
      .filter((p) => (filter === 'all' ? true : filter === 'due' ? due.has(p.id) : p.categories.includes(filter)))
      .sort(
        (a, b) =>
          SEVERITY_RANK[b.riskLevel ?? 'none'] - SEVERITY_RANK[a.riskLevel ?? 'none'] ||
          Number(due.has(b.id)) - Number(due.has(a.id)) ||
          a.name.localeCompare(b.name),
      );
  }, [db.patients, query, filter, due, user.id]);

  const highRisk = Object.values(db.patients).filter((p) => SEVERITY_RANK[p.riskLevel ?? 'none'] >= SEVERITY_RANK.high).length;

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.page }}>
        <ActivityIndicator size="large" color={theme.accent.accent} />
      </View>
    );
  }

  const padX = theme.layout.screenPaddingX;
  // Pale sage -> page: the hero melts into the list background with no seam.
  const heroBg = theme.gradient([theme.accent.heroGradient[0], theme.accent.heroGradient[1], theme.colors.page], theme.accent.heroGradientLocations);

  const header = (
    <View style={{ gap: theme.space[4], marginBottom: theme.space[1] }}>
      {/* Hero */}
      <View
        style={{
          backgroundColor: theme.accent.accentSoft,
          backgroundImage: heroBg,
          paddingTop: insets.top + theme.space[4],
          paddingHorizontal: padX,
          paddingBottom: theme.space[2],
          gap: theme.space[4],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
          <Avatar name={user.name} size="lg" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3" numberOfLines={2} testID="asha-greeting">
              {t('home.greeting', { name: user.name })}
            </Text>
            <Text variant="caption" color={theme.colors.textOnHeroSecondary} numberOfLines={1}>
              {todayLabel(lang)}
            </Text>
          </View>
          <IconButton
            icon="person-outline"
            variant="glass"
            accessibilityLabel={t('home.openProfile')}
            onPress={() => router.push('/asha/profile')}
            testID="asha-profile-button"
          />
        </View>

        <SyncPill status={sync} pending={db.outbox.length} t={t} onPress={syncNow} />

        <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: theme.space[3] }}>
          <StatTile n={highRisk} label={t('home.highRisk')} icon="warning-outline" danger onPress={() => router.push('/asha/alerts')} testID="tile-high-risk" />
          <StatTile n={due.size} label={t('home.dueToday')} icon="calendar-outline" onPress={() => setFilter('due')} testID="tile-due" />
          <StatTile n={openReferrals} label={t('home.referrals')} icon="paper-plane-outline" onPress={() => router.push('/asha/referrals')} testID="tile-referrals" />
        </View>
      </View>

      <View style={{ paddingHorizontal: padX, gap: theme.space[4] }}>
        {openAlerts.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('home.attentionTitle')}. ${t('home.attentionBody', { n: openAlerts.length })}`}
            onPress={() => router.push('/asha/alerts')}
            testID="attention-card"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[3],
              minHeight: theme.sizes.touchMin,
              padding: theme.layout.cardPadding,
              borderRadius: theme.radii.xl,
              backgroundColor: theme.colors.status.danger.bg,
              borderWidth: theme.highContrast ? 1 : 0,
              borderColor: theme.colors.status.danger.solid,
              transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
            })}
          >
            <View
              style={{
                width: theme.sizes.iconChip,
                height: theme.sizes.iconChip,
                borderRadius: theme.radii.sm,
                backgroundColor: theme.colors.status.danger.solid,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="warning" size={theme.sizes.icon.sm} color={theme.colors.status.onSolid} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title" color={theme.colors.status.danger.fg}>
                {t('home.attentionTitle')}
              </Text>
              <Text variant="caption" color={theme.colors.status.danger.fg}>
                {t('home.attentionBody', { n: openAlerts.length })}
              </Text>
            </View>
            <Icon name="chevron-forward" size={theme.sizes.icon.sm} color={theme.colors.status.danger.icon} flipInRTL />
          </Pressable>
        ) : null}

        <SearchBar placeholder={t('home.search')} value={query} onChangeText={setQuery} testID="asha-search" />

        <ChipScroll>
          {FILTERS.map((f) => (
            <Chip
              key={f}
              label={f === 'all' ? t('home.all') : f === 'due' ? t('home.dueList') : t(`cat.${f}`)}
              selected={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </ChipScroll>

        <SectionHeader title={`${t('home.caseload')} · ${patients.length}`} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.page }} testID="screen-asha-home">
      <Stack.Screen options={{ title: t('app.title') }} />
      <ScreenGuide id="ashaHome" button={false} />
      <FlatList
        data={patients}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: theme.space[6] }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: theme.space[3] }} />}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: padX }}>
            <PatientRow patient={item} lastVisit={lastVisit.get(item.id)} lang={lang} />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: padX }}>
            <EmptyState icon="people-outline" title={t('home.empty')} />
          </View>
        }
      />
      <View
        style={{
          paddingHorizontal: padX,
          paddingTop: theme.space[3],
          paddingBottom: insets.bottom + theme.space[4],
          backgroundColor: theme.colors.page,
          borderTopWidth: 1,
          borderTopColor: theme.colors.divider,
        }}
      >
        <PrimaryButton label={t('home.addPatientCta')} icon="person-add" onPress={() => router.push('/asha/patient/new')} testID="add-patient" />
      </View>
    </View>
  );
}

function StatTile({ n, label, icon, onPress, danger, testID }: { n: number; label: string; icon: IconName; onPress: () => void; danger?: boolean; testID?: string }) {
  const theme = useTheme();
  const alarm = danger && n > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${n}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? theme.motion.pressScale : 1 }] })}
    >
      <Glass radius="xl" style={{ flexGrow: 1, padding: theme.space[3], gap: theme.space[1], minHeight: theme.sizes.tileMin }}>
        <Icon name={icon} size={theme.sizes.icon.sm} color={alarm ? theme.colors.status.danger.icon : theme.accent.accentIcon} />
        <Text variant="h2" weight="bold" numeric color={alarm ? theme.colors.status.danger.fg : theme.colors.textPrimary}>
          {String(n)}
        </Text>
        {/* No line cap: at large text sizes the label wraps and the tile grows instead of clipping. */}
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      </Glass>
    </Pressable>
  );
}

function SyncPill({ status, pending, t, onPress }: { status: SyncStatus; pending: number; t: T; onPress: () => void }) {
  const theme = useTheme();
  let label: string;
  let tone: PillTone = 'accent';
  let icon: IconName = 'cloud-done-outline';
  switch (status.kind) {
    case 'local':
      label = t('sync.noServer');
      icon = 'phone-portrait-outline';
      break;
    case 'offline':
      label = t('sync.offline', { n: pending });
      tone = 'neutral';
      icon = 'cloud-offline-outline';
      break;
    case 'syncing':
      label = t('sync.running');
      tone = 'info';
      icon = 'sync-outline';
      break;
    case 'error':
      label = t('sync.error');
      tone = 'danger';
      icon = 'alert-circle-outline';
      break;
    default:
      label = pending ? t('sync.waiting', { n: pending }) : t('sync.ok');
      tone = pending ? 'warning' : 'accent';
      icon = pending ? 'cloud-upload-outline' : 'cloud-done-outline';
  }
  const disabled = status.kind === 'local' || status.kind === 'syncing';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={theme.sizes.hitSlop}
      testID="asha-sync-pill"
      style={{ alignSelf: 'flex-start', minHeight: theme.sizes.touchMin, justifyContent: 'center' }}
    >
      <Pill label={label} tone={tone} icon={icon} style={{ minHeight: 32 }} />
    </Pressable>
  );
}
