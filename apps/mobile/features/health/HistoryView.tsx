/**
 * Renders a PatientHistory (server/records/history.ts): the same component
 * for the patient's own History screen and for a doctor who scanned a QR.
 */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import { Card, Icon, Pill, SectionHeader, StatCard, Text, type IconName, type PillTone } from '@/features/shared/ui';

import type { PatientHistory, StatCard as StatCardData, TimelineEntry } from '@server/records/history';

import { VitalsChart } from './VitalsChart';

const KIND_ICON: Record<TimelineEntry['kind'], IconName> = {
  asha_visit: 'walk-outline',
  consultation: 'medkit-outline',
  prescription: 'document-text-outline',
  report: 'folder-open-outline',
  referral: 'paper-plane-outline',
  risk_alert: 'alert-circle-outline',
};

const STAT_ICON: Record<StatCardData['key'], IconName> = {
  blood_group: 'water',
  weight: 'body',
  heart_rate: 'pulse',
  blood_pressure: 'speedometer-outline',
  spo2: 'leaf-outline',
};

export function statTone(status: StatCardData['status']): PillTone {
  return status === 'attention' ? 'warning' : status === 'normal' ? 'success' : 'neutral';
}

export function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

export function StatCards({ cards, testID }: { cards: StatCardData[]; testID?: string }) {
  const { t } = useTranslation('health');
  const theme = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[3] }}>
      {cards.map((c) => (
        <StatCard
          key={c.key}
          label={t(`stat.${c.key}`)}
          value={c.value}
          unit={c.unit ?? undefined}
          caption={c.status === 'attention' ? t('stat.attention') : c.status === 'normal' ? t('stat.normal') : t('stat.unknown')}
          icon={STAT_ICON[c.key]}
          chart={c.key === 'heart_rate' ? 'ecg' : 'none'}
          style={{ width: '47%', flexGrow: 1 }}
          testID={`stat-${c.key}`}
        />
      ))}
    </View>
  );
}

export function HistoryView({ history, showPatientHeader = true, testID }: { history: PatientHistory; showPatientHeader?: boolean; testID?: string }) {
  const { t, i18n } = useTranslation('health');
  const theme = useTheme();
  const { patient, alerts, statCards, timeline, vitals, adherence } = history;
  const pct = adherence.rate === null ? null : Math.round(adherence.rate * 100);

  return (
    <View testID={testID} style={{ gap: theme.space[5] }}>
      {showPatientHeader ? (
        <Card radius="xl" padding="lg">
          <View style={{ gap: theme.space[1] }}>
            <Text variant="h2" testID="history-patient-name">
              {patient.fullName}
            </Text>
            <Text tone="secondary">
              {[patient.age !== null ? t('history.age', { age: patient.age }) : null, patient.sex ? t(`history.sex.${patient.sex}`) : null, patient.bloodGroup, patient.area]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </Card>
      ) : null}

      {alerts.allergies.length || alerts.chronicConditions.length || alerts.openRiskAlerts.length ? (
        <Card tone="muted" radius="xl" padding="lg" testID="history-alerts">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="label">{t('history.alerts')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
              {alerts.allergies.map((a) => (
                <Pill key={`al-${a}`} label={t('history.allergy', { name: a })} tone="danger" icon="warning-outline" />
              ))}
              {alerts.chronicConditions.map((c) => (
                <Pill key={`cc-${c}`} label={c} tone="warning" icon="fitness-outline" />
              ))}
            </View>
            {alerts.openRiskAlerts.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', gap: theme.space[2], alignItems: 'flex-start' }}>
                <Icon name="alert-circle" size={theme.sizes.icon.sm} color={theme.colors.status.danger.icon} />
                <Text variant="bodySmall" style={{ flex: 1 }}>
                  {r.reason}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('history.vitals')} />
        <StatCards cards={statCards} testID="history-stats" />
      </View>

      {vitals.length ? (
        <View style={{ gap: theme.space[3] }}>
          <SectionHeader title={t('history.trends')} />
          <Card radius="xl" padding="lg">
            <View style={{ gap: theme.space[4] }}>
              {vitals.slice(0, 3).map((s) => (
                <VitalsChart key={s.metric} series={s} testID={`series-${s.metric}`} />
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('history.adherence')} />
        <Card radius="xl" padding="lg" testID="history-adherence">
          <View style={{ gap: theme.space[2] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text tone="secondary">{t('history.adherenceWindow', { days: adherence.windowDays })}</Text>
              <Text variant="h2" numeric>
                {pct === null ? '—' : `${pct}%`}
              </Text>
            </View>
            <Text variant="bodySmall" tone="secondary">
              {t('history.adherenceCounts', { taken: adherence.taken, missed: adherence.missed, skipped: adherence.skipped })}
            </Text>
            {adherence.perMedicine.slice(0, 3).map((m) => (
              <View key={m.medicineName} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="bodySmall" style={{ flex: 1 }}>
                  {m.medicineName}
                </Text>
                <Text variant="bodySmall" weight="semibold" numeric>
                  {m.rate === null ? '—' : `${Math.round(m.rate * 100)}%`}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('history.timeline')} />
        <View style={{ gap: theme.space[2] }} testID="history-timeline">
          {timeline.map((e) => (
            <Card key={e.id} radius="lg" padding="md">
              <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: theme.radii.md,
                    backgroundColor: e.highRisk ? theme.colors.status.danger.bg : theme.accent.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon name={KIND_ICON[e.kind]} size={theme.sizes.icon.sm} color={e.highRisk ? theme.colors.status.danger.icon : theme.accent.accentIcon} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space[2] }}>
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {e.title}
                    </Text>
                    <Text variant="caption" tone="tertiary" numeric>
                      {formatWhen(e.at, i18n.language)}
                    </Text>
                  </View>
                  {e.subtitle ? (
                    <Text variant="bodySmall" tone="secondary">
                      {e.subtitle}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap' }}>
                    <Pill label={t(`kind.${e.kind}`)} tone={e.highRisk ? 'danger' : 'neutral'} icon={KIND_ICON[e.kind]} />
                    {e.actorName ? <Pill label={e.actorName} tone="info" icon="person-outline" /> : null}
                  </View>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </View>
    </View>
  );
}
