import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { applyAction, availableActions } from '@am/records';
import { DEMO_PROFILES } from '@am/shared';

import type { LabComparison as LabComparisonData } from '@server/copilot/labs';

import { useAdmin } from '@/features/doctor/adminStore';
import { ClinicalTimeline } from '@/features/doctor/components/ClinicalTimeline';
import { CopilotSummaryCard } from '@/features/doctor/components/CopilotSummaryCard';
import { LabComparison } from '@/features/doctor/components/LabComparison';
import { useCopilotSummary } from '@/features/doctor/copilot/useCopilot';
import { useSession } from '@/features/shared/state/session';
import { ageFrom } from '@/features/doctor/prescriptions';
import { useColumns, usePatientRecord } from '@/features/doctor/useDoctorData';
import { useRecords } from '@/features/shared/data/recordsStore';
import { pullPatientRecords, usePullWhileOpen } from '@/features/shared/data/serverSync';
import { useTheme } from '@/features/shared/theme';
import { Avatar, Card, EmptyState, Heading, Icon, IconButton, Pill, PrimaryButton, Screen, SecondaryButton, SectionHeader, Text } from '@/features/shared/ui';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';

/** One patient as the doctor sees them: summary, vitals, prescriptions, consultations, referrals, alerts. */
export default function DoctorPatient() {
  const { id, via, referralId } = useLocalSearchParams<{ id: string; via?: string; referralId?: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('copilot');
  const theme = useTheme();
  const role = useSession((s) => s.role);
  const copilot = useCopilotSummary(id);
  const [labsSaved, setLabsSaved] = useState<LabComparisonData | null>(null);
  const { twoColumn } = useColumns();
  // The latest record from the server (ASHA visits, other doctors' notes); the local copy shows meanwhile.
  usePullWhileOpen(id ? () => pullPatientRecords(id) : null, `doctor-patient-${id}`);
  const rec = usePatientRecord(id);
  const updateReferral = useRecords((s) => s.updateReferral);
  const staff = useAdmin((s) => s.staff);

  if (!rec.patient) {
    return (
      <Screen background="page" testID="screen-doctor-patient">
        <IconButton icon="arrow-back" accessibilityLabel={t('back')} flipInRTL onPress={() => (router.canGoBack() ? router.back() : router.replace('/patients'))} />
        <EmptyState icon="person-outline" title={t('patient.notFound')} body={t('patient.notFoundBody')} />
      </Screen>
    );
  }
  const p = rec.patient;
  const age = ageFrom(p.dateOfBirth);
  const asha = [...staff, ...DEMO_PROFILES].find((s) => s.id === p.ashaWorkerId);
  const latest = rec.vitals[0];
  const openReferral = rec.referrals.find((r) => r.id === referralId) ?? rec.referrals.find((r) => r.status !== 'closed');
  const openAlerts = rec.riskAlerts.filter((a) => a.resolvedAt === null);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ gap: theme.space[3], flex: twoColumn ? 1 : undefined, minWidth: twoColumn ? 300 : undefined }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );

  return (
    <Screen background="page" testID="screen-doctor-patient" contentStyle={{ gap: theme.space[5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('back')} flipInRTL onPress={() => (router.canGoBack() ? router.back() : router.replace('/patients'))} />
        <Avatar name={p.fullName} size="lg" />
        <View style={{ flex: 1 }}>
          <Heading variant="h2">{p.fullName}</Heading>
          <Text tone="secondary">{[age !== null ? t('patient.age', { age }) : null, p.sex ? t(`sex.${p.sex}`) : null, p.area].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      {via === 'qr' ? <Pill label={t('patient.openedViaQr')} tone="info" icon="qr-code-outline" /> : null}
      <ScreenGuide id="doctorPatient" />
      {openAlerts.length ? <Pill label={t('patient.highRiskOpen', { count: openAlerts.length })} tone="danger" icon="warning" /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        <Pill label={t('patient.bloodGroup', { group: p.bloodGroup ?? '—' })} tone="neutral" icon="water-outline" />
        <Pill label={asha ? t('patient.asha', { name: asha.fullName }) : t('patient.noAsha')} tone="neutral" icon="walk-outline" />
      </View>
      <Card radius="lg" padding="md">
        <View style={{ gap: theme.space[1] }}>
          <Text variant="label">{t('patient.allergies')}</Text>
          <Text>{p.allergies.length ? p.allergies.join(', ') : t('none')}</Text>
          <Text variant="label" style={{ marginTop: theme.space[2] }}>
            {t('patient.conditions')}
          </Text>
          <Text>{p.chronicConditions.length ? p.chronicConditions.join(', ') : t('none')}</Text>
        </View>
      </Card>

      {copilot.summary ? (
        <CopilotSummaryCard summary={copilot.summary} source={copilot.source} narrative={copilot.narrative} narrativeState={copilot.narrativeState} onRequestNarrative={() => void copilot.requestNarrative()} />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        <PrimaryButton label={t('consultation.new')} icon="create-outline" onPress={() => router.push({ pathname: '/consultation/[patientId]', params: { patientId: p.id, referralId: openReferral?.id ?? '' } })} testID="new-consultation" />
      </View>

      <View style={{ flexDirection: twoColumn ? 'row' : 'column', gap: theme.space[5] }}>
        <Section title={t('patient.latestVitals')}>
          {latest ? (
            <Card radius="lg" padding="md">
              <View style={{ gap: theme.space[1] }}>
                {latest.systolic && latest.diastolic ? <Text>{t('vitals.bp', { s: latest.systolic, d: latest.diastolic })}</Text> : null}
                {latest.heartRate ? <Text>{t('vitals.hr', { v: latest.heartRate })}</Text> : null}
                {latest.weightKg ? <Text>{t('vitals.weight', { v: latest.weightKg })}</Text> : null}
                {latest.spo2 ? <Text>{t('vitals.spo2', { v: latest.spo2 })}</Text> : null}
                <Text variant="caption" tone="tertiary">
                  {t('vitals.recorded', { date: new Date(latest.recordedAt).toLocaleDateString(), source: t(`vitals.source.${latest.source}`) })}
                </Text>
              </View>
            </Card>
          ) : (
            <Text tone="secondary">{t('patient.noVitals')}</Text>
          )}
        </Section>

        <Section title={t('patient.referrals')}>
          {rec.referrals.length === 0 ? (
            <Text tone="secondary">{t('patient.noReferrals')}</Text>
          ) : (
            rec.referrals.map((r) => (
              <Card key={r.id} radius="lg" padding="md" testID={`patient-referral-${r.id}`}>
                <View style={{ gap: theme.space[2] }}>
                  <Pill label={t(`status.${r.status}`)} tone={r.status === 'pending' ? 'warning' : r.status === 'closed' ? 'neutral' : 'success'} icon="paper-plane-outline" />
                  <Text variant="bodySmall">{r.reason}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                    {availableActions(r).map((a) => (
                      <SecondaryButton
                        key={a}
                        label={t(`actions.${a}`)}
                        onPress={() => {
                          const patch = applyAction(r, a, new Date());
                          if (patch) updateReferral(r.id, patch);
                        }}
                        testID={`patient-referral-${r.id}-${a}`}
                      />
                    ))}
                  </View>
                </View>
              </Card>
            ))
          )}
        </Section>
      </View>

      <Section title={t('patient.prescriptions')}>
        {rec.prescriptions.length === 0 ? (
          <Text tone="secondary">{t('patient.noPrescriptions')}</Text>
        ) : (
          rec.prescriptions.map((rx) => (
            <Card key={rx.id} radius="lg" padding="md" testID={`rx-${rx.id}`}>
              <View style={{ gap: theme.space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
                  <Icon name={rx.source === 'doctor' ? 'medkit-outline' : 'scan-outline'} size={theme.sizes.icon.sm} color={theme.accent.accentIcon} />
                  <Text variant="title" style={{ flex: 1 }}>
                    {rx.diagnosis ?? t(`rx.source.${rx.source}`)}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {new Date(rx.issuedAt).toLocaleDateString()}
                  </Text>
                </View>
                {rx.items.map((it, i) => (
                  <Text key={i} variant="bodySmall">
                    {`${it.name} · ${it.dosage} · ${it.frequency}${it.durationDays ? ` · ${t('rx.days', { n: it.durationDays })}` : ''}`}
                  </Text>
                ))}
              </View>
            </Card>
          ))
        )}
      </Section>

      <Section title={t('patient.consultations')}>
        {rec.consultations.length === 0 ? (
          <Text tone="secondary">{t('patient.noConsultations')}</Text>
        ) : (
          rec.consultations.map((c) => (
            <Card key={c.id} radius="lg" padding="md">
              <View style={{ gap: theme.space[1] }}>
                <Text variant="title">{c.diagnosis ?? t('consultation.untitled')}</Text>
                {c.notes ? <Text variant="bodySmall">{c.notes}</Text> : null}
                {c.labOrders.length ? (
                  <Text variant="bodySmall" tone="secondary">
                    {t('consultation.labs', { labs: c.labOrders.join(', ') })}
                  </Text>
                ) : null}
                <Text variant="caption" tone="tertiary">
                  {new Date(c.startedAt).toLocaleDateString()}
                  {c.followUpDate ? ` · ${t('consultation.followUpOn', { date: c.followUpDate })}` : ''}
                </Text>
              </View>
            </Card>
          ))
        )}
      </Section>

      <Section title={tc('labs.title')}>
        <LabComparison patientId={p.id} comparison={labsSaved ?? copilot.summary?.labs ?? null} canEdit={role === 'doctor'} onSaved={(c) => (setLabsSaved(c), copilot.reload())} />
      </Section>

      <Section title={tc('timeline.title')}>
        <ClinicalTimeline entries={copilot.summary?.timeline ?? []} />
      </Section>

      <Section title={t('patient.alerts')}>
        {rec.riskAlerts.length === 0 ? (
          <Text tone="secondary">{t('patient.noAlerts')}</Text>
        ) : (
          rec.riskAlerts.map((a) => (
            <Card key={a.id} radius="lg" padding="md">
              <View style={{ gap: theme.space[1] }}>
                <Pill label={t(`risk.${a.level}`)} tone={a.level === 'high' ? 'danger' : 'warning'} icon="warning" />
                <Text variant="bodySmall">{a.reason}</Text>
              </View>
            </Card>
          ))
        )}
      </Section>
      <Text variant="caption" tone="tertiary">
        {t('demoNote')}
      </Text>
    </Screen>
  );
}
