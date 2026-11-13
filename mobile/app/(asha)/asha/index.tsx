import { router, Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PatientRow } from '../../../features/asha/components/PatientRow';
import { Button, Chip, ChipRow, colors } from '../../../features/asha/components/ui';
import { followUpsDue, latestVisitByPatient } from '../../../features/asha/logic/clinical';
import { SEVERITY_RANK } from '../../../features/asha/logic/rules';
import { useAsha, type SyncStatus } from '../../../features/asha/store/AshaContext';
import type { PatientCategory } from '../../../features/asha/types';

const FILTERS: (PatientCategory | 'all' | 'due')[] = ['all', 'due', 'pregnant', 'newborn', 'ncd', 'tb', 'elderly'];

export default function AshaHome() {
  const { ready, db, user, lang, setLang, t, sync, syncNow, store } = useAsha();
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          title: t('app.title'),
          headerRight: () => (
            <Pressable onPress={() => setLang(lang === 'hi' ? 'en' : 'hi')} hitSlop={10} accessibilityLabel="Switch language">
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{lang === 'hi' ? 'EN' : 'हिं'}</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={patients}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={s.headRow}>
              <Text style={s.greet}>{t('home.greeting', { name: user.name })}</Text>
              <SyncPill status={sync} pending={db.outbox.length} t={t} onPress={syncNow} />
            </View>
            <View style={s.tiles}>
              <Tile n={highRisk} label={t('home.highRisk')} tone="danger" onPress={() => router.push('/asha/alerts')} />
              <Tile n={due.size} label={t('home.dueToday')} onPress={() => setFilter('due')} />
              <Tile n={openReferrals} label={t('home.referrals')} onPress={() => router.push('/asha/referrals')} />
            </View>
            {openAlerts.length ? (
              <Pressable onPress={() => router.push('/asha/alerts')} style={s.alertBanner}>
                <Text style={s.alertBannerText}>
                  ⚠ {openAlerts.length} {t('home.alerts')} ›
                </Text>
              </Pressable>
            ) : null}
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('home.search')}
              placeholderTextColor={colors.muted}
              style={s.search}
            />
            <ChipRow>
              {FILTERS.map((f) => (
                <Chip
                  key={f}
                  label={f === 'all' ? t('home.all') : f === 'due' ? t('home.dueList') : t(`cat.${f}`)}
                  selected={filter === f}
                  onPress={() => setFilter(f)}
                />
              ))}
            </ChipRow>
          </View>
        }
        renderItem={({ item }) => <PatientRow patient={item} lastVisit={lastVisit.get(item.id)} lang={lang} />}
        ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 24 }}>{t('home.empty')}</Text>}
      />
      <View style={s.fab}>
        <Button title={t('home.addPatient')} onPress={() => router.push('/asha/patient/new')} />
      </View>
    </View>
  );
}

function Tile({ n, label, onPress, tone }: { n: number; label: string; onPress: () => void; tone?: 'danger' }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, { opacity: pressed ? 0.8 : 1 }]}>
      <Text style={[s.tileN, tone === 'danger' && n > 0 && { color: colors.danger }]}>{n}</Text>
      <Text style={s.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function SyncPill({ status, pending, t, onPress }: { status: SyncStatus; pending: number; t: (k: string, p?: Record<string, string | number>) => string; onPress: () => void }) {
  let label: string;
  let color: string = colors.primary;
  switch (status.kind) {
    case 'local':
      label = t('sync.noServer');
      color = colors.muted;
      break;
    case 'offline':
      label = t('sync.offline', { n: pending });
      color = colors.muted;
      break;
    case 'syncing':
      label = t('sync.running');
      break;
    case 'error':
      label = t('sync.error');
      color = colors.danger;
      break;
    default:
      label = pending ? t('sync.waiting', { n: pending }) : t('sync.ok');
  }
  return (
    <Pressable onPress={onPress} disabled={status.kind === 'local' || status.kind === 'syncing'} style={[s.pill, { borderColor: color }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  greet: { fontSize: 20, fontWeight: '800', color: colors.text, flexShrink: 1 },
  pill: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  tileN: { fontSize: 26, fontWeight: '800', color: colors.text },
  tileLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  alertBanner: { backgroundColor: colors.risk.critical.bg, borderRadius: 12, padding: 12 },
  alertBannerText: { color: colors.risk.critical.fg, fontWeight: '800', fontSize: 15 },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, backgroundColor: '#fff', color: colors.text },
  fab: { position: 'absolute', left: 16, right: 16, bottom: 20 },
});
