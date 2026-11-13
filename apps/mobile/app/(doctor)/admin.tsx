import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { BLOOD_COMPONENTS, buildAdminAnalytics, type BloodBank, type StockEntry } from '@am/records';
import { BLOOD_GROUPS } from '@am/shared';

import { applyOverrides, facilityBank, useAdmin } from '@/features/doctor/adminStore';
import { BarChart } from '@/features/doctor/components/BarChart';
import { useColumns } from '@/features/doctor/useDoctorData';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useCurrentUser } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Avatar, Card, ErrorState, Heading, IconButton, Pill, Screen, SecondaryButton, SectionHeader, Skeleton, StatCard, Text } from '@/features/shared/ui';

function Stepper({ label, value, onChange, testID }: { label: string; value: number; onChange: (v: number) => void; testID?: string }) {
  const th = useTheme();
  const { t } = useTranslation('doctor');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[2] }} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <Text variant="bodySmall" style={{ width: 44 }}>
        {label}
      </Text>
      <IconButton icon="remove" accessibilityLabel={t('admin.less')} onPress={() => onChange(value - 1)} />
      <Text variant="title" numeric style={{ minWidth: 36, textAlign: 'center' }}>
        {String(value)}
      </Text>
      <IconButton icon="add" accessibilityLabel={t('admin.more')} onPress={() => onChange(value + 1)} />
    </View>
  );
}

/** Admin tools: staff approvals, ASHA assignments, blood stock, analytics. */
export default function AdminScreen() {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const user = useCurrentUser();
  const { twoColumn } = useColumns();
  const { staff, stock, setActive, setStock } = useAdmin();
  const patients = useRecords((s) => s.patients);
  const riskAlerts = useRecords((s) => s.riskAlerts);
  const doseLogs = useRecords((s) => s.doseLogs);
  const consultations = useRecords((s) => s.consultations);
  const upsertPatient = useRecords((s) => s.upsertPatient);
  const [bank, setBank] = useState<{ bank: BloodBank; stock: StockEntry[] } | null | undefined>(undefined);
  const [component, setComponent] = useState(BLOOD_COMPONENTS[0].key);

  useEffect(() => {
    facilityBank()
      .then((r) => setBank(r ? { bank: r.bank, stock: r.matchingStock } : null))
      .catch(() => setBank(null));
  }, []);

  const ashas = staff.filter((s) => s.role === 'asha');
  const analytics = useMemo(
    () =>
      buildAdminAnalytics({
        now: new Date(),
        staff,
        patients: Object.values(patients),
        visits: consultations.map((c) => ({ id: c.id, patientId: c.patientId, ashaWorkerId: patients[c.patientId]?.ashaWorkerId ?? '', visitedAt: c.startedAt, notes: c.notes, riskLevel: null })),
        riskAlerts,
        doseLogs,
      }),
    [staff, patients, consultations, riskAlerts, doseLogs],
  );
  const visibleStock = bank ? applyOverrides(bank.stock, stock).filter((s) => s.component === component) : [];

  return (
    <Screen withTabBar background="page" testID="screen-admin" contentStyle={{ gap: theme.space[5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <View style={{ flex: 1, gap: theme.space[1] }}>
          <Heading variant="h1">{t('admin.title')}</Heading>
          <Text tone="secondary">{user?.role === 'admin' ? t('admin.subtitleAdmin') : t('admin.subtitleDoctor')}</Text>
        </View>
        <IconButton icon="person-circle-outline" accessibilityLabel={t('admin.profile')} onPress={() => router.push('/doctor-profile')} testID="admin-profile" />
      </View>

      <View style={{ flexDirection: twoColumn ? 'row' : 'column', gap: theme.space[3] }}>
        <StatCard label={t('admin.adherence')} value={analytics.adherence.rate === null ? '—' : `${Math.round(analytics.adherence.rate * 100)}`} unit={analytics.adherence.rate === null ? undefined : '%'} caption={t('admin.adherenceCaption', { n: analytics.adherence.patientsBelow80 })} icon="checkmark-done-outline" style={{ flex: 1 }} testID="admin-adherence" />
        <StatCard label={t('admin.pendingApprovals')} value={String(analytics.pendingApprovals.length)} icon="person-add-outline" style={{ flex: 1 }} />
      </View>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('admin.analytics')} />
        <Card radius="xl" padding="lg">
          <View style={{ gap: theme.space[4] }}>
            <BarChart title={t('admin.visitsPerAsha')} bars={analytics.visitsPerAsha.map((v) => ({ label: v.name, value: v.visits, secondary: v.highRiskVisits }))} testID="chart-visits" />
            <BarChart title={t('admin.highRiskByArea')} bars={analytics.highRiskByArea.map((a) => ({ label: a.area, value: a.total, secondary: a.open }))} testID="chart-risk" />
          </View>
        </Card>
      </View>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('admin.staff')} />
        {staff.map((s) => (
          <Card key={s.id} radius="lg" padding="md" testID={`staff-${s.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
              <Avatar name={s.fullName} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{s.fullName}</Text>
                <Text variant="bodySmall" tone="secondary">
                  {t(`common:roles.${s.role}`)}
                </Text>
              </View>
              <Pill label={s.isActive ? t('admin.active') : t('admin.pending')} tone={s.isActive ? 'success' : 'warning'} icon={s.isActive ? 'checkmark-circle' : 'time-outline'} />
              {s.role !== 'admin' ? (
                <SecondaryButton label={s.isActive ? t('admin.deactivate') : t('admin.approve')} onPress={() => setActive(s.id, !s.isActive)} testID={`staff-${s.id}-toggle`} />
              ) : null}
            </View>
          </Card>
        ))}
      </View>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('admin.assignments')} />
        {Object.values(patients).map((p) => (
          <Card key={p.id} radius="lg" padding="md">
            <View style={{ gap: theme.space[2] }}>
              <Text variant="title">{p.fullName}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                {ashas.map((a) => {
                  const selected = p.ashaWorkerId === a.id;
                  return (
                    <Pressable
                      key={a.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={a.fullName}
                      onPress={() => upsertPatient({ ...p, ashaWorkerId: a.id })}
                      testID={`assign-${p.id}-${a.id}`}
                      style={{ minHeight: theme.sizes.touchMin, paddingHorizontal: theme.space[3], justifyContent: 'center', borderRadius: theme.radii.full, borderWidth: 1.5, borderColor: selected ? theme.accent.accent : theme.colors.border, backgroundColor: selected ? theme.accent.accentSoft : theme.colors.surface }}>
                      <Text variant="bodySmall" weight={selected ? 'semibold' : 'regular'}>
                        {a.fullName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Card>
        ))}
      </View>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('admin.bloodStock')} />
        {bank === undefined ? (
          <Skeleton height={160} />
        ) : bank === null ? (
          <ErrorState title={t('admin.bankError')} />
        ) : (
          <Card radius="xl" padding="lg">
            <View style={{ gap: theme.space[3] }}>
              <Text variant="title">{bank.bank.name}</Text>
              <Pill label={t('admin.demoStock')} tone="warning" icon="flask-outline" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                {BLOOD_COMPONENTS.map((c) => (
                  <Pressable key={c.key} accessibilityRole="radio" accessibilityState={{ selected: component === c.key }} accessibilityLabel={c.label} onPress={() => setComponent(c.key)} style={{ minHeight: theme.sizes.touchMin, paddingHorizontal: theme.space[3], justifyContent: 'center', borderRadius: theme.radii.full, borderWidth: 1.5, borderColor: component === c.key ? theme.accent.accent : theme.colors.border }}>
                    <Text variant="bodySmall">{c.short}</Text>
                  </Pressable>
                ))}
              </View>
              {BLOOD_GROUPS.map((g) => {
                const row = visibleStock.find((s) => s.bloodGroup === g);
                return <Stepper key={g} label={g} value={row?.units ?? stock[`${g}|${component}`] ?? 0} onChange={(v) => setStock(g, component, v)} testID={`stock-${g}`} />;
              })}
            </View>
          </Card>
        )}
      </View>
      <Text variant="caption" tone="tertiary">
        {t('demoNote')}
      </Text>
    </Screen>
  );
}
