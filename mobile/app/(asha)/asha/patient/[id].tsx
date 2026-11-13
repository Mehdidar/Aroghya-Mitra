import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { AlertCard } from '../../../../features/asha/components/AlertCard';
import { patientAgeLabel } from '../../../../features/asha/components/PatientRow';
import { Button, Card, colors, H, Muted, RiskBadge, Row, Screen } from '../../../../features/asha/components/ui';
import { eddFromLmp, formatDate, gestationWeeks, isPregnant } from '../../../../features/asha/logic/clinical';
import { urgencyFor } from '../../../../features/asha/logic/rules';
import { useAsha } from '../../../../features/asha/store/AshaContext';
import type { Visit, Vitals } from '../../../../features/asha/types';

export default function PatientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, store, lang, t, user } = useAsha();
  const patient = db.patients[id];
  const visits = useMemo(() => (patient ? store.visitsFor(patient.id) : []), [db.visits, patient, store]);
  const alerts = useMemo(() => (patient ? store.currentAlerts(patient.id) : []), [db.alerts, db.visits, patient, store]);
  const referrals = useMemo(() => (patient ? store.referralsFor(patient.id) : []), [db.referrals, patient, store]);

  if (!patient) {
    return (
      <Screen>
        <Muted>{t('patient.notFound')}</Muted>
      </Screen>
    );
  }

  const risk = patient.riskLevel ?? 'none';
  const openReferral = referrals.find((r) => r.status === 'pending' || r.status === 'accepted');

  const refer = () => {
    const urgency = urgencyFor(alerts);
    Alert.alert(t('visit.referPrompt'), t('visit.referPromptBody', { n: alerts.length, urgency: t(`urgency.${urgency}`) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('visit.referYes'),
        onPress: async () => {
          await store.createReferral({ patientId: patient.id, fromAshaId: user.id, alertIds: alerts.map((a) => a.id), urgency, visitId: visits[0]?.id });
          Alert.alert('', t('referrals.created', { urgency: t(`urgency.${urgency}`) }));
        },
      },
    ]);
  };

  return (
    <Screen
      footer={<Button title={t('patient.newVisit')} onPress={() => router.push(`/asha/visit/${patient.id}`)} />}
    >
      <Stack.Screen options={{ title: patient.name }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H>{patient.name}</H>
          <RiskBadge level={risk} label={t(`risk.${risk}`)} />
        </Row>
        <Muted>
          {patient.sex} · {patientAgeLabel(patient, lang)} · {patient.village}
          {patient.address ? ` · ${patient.address}` : ''}
        </Muted>
        <Muted>{patient.categories.map((c) => t(`cat.${c}`)).join(' · ')}</Muted>
        {isPregnant(patient) ? (
          <Text style={{ color: colors.primary, fontWeight: '700' }}>
            {t('patient.ga', { n: gestationWeeks(patient.pregnancy!.lmp) })} · {t('patient.edd', { date: formatDate(eddFromLmp(patient.pregnancy!.lmp)) })}
            {patient.pregnancy?.gravida ? ` · G${patient.pregnancy.gravida}` : ''}
          </Text>
        ) : null}
        {patient.newborn?.birthWeightKg ? <Muted>{t('form.birthWeight')}: {patient.newborn.birthWeightKg}</Muted> : null}
        {patient.conditions?.length ? (
          <Muted>
            {t('patient.conditions')}: {patient.conditions.map((c) => t(`cond.${c}`)).join(', ')}
          </Muted>
        ) : null}
        {patient.phone ? (
          <Button title={`📞 ${t('patient.call')} ${patient.phone}`} variant="secondary" onPress={() => Linking.openURL(`tel:${patient.phone}`)} />
        ) : null}
      </Card>

      <Card>
        <H>{t('patient.currentAlerts')}</H>
        {alerts.length ? alerts.map((a) => <AlertCard key={a.id} alert={a} lang={lang} onAck={a.acknowledged ? undefined : () => store.acknowledgeAlert(a.id)} />) : <Muted>{t('patient.noAlerts')}</Muted>}
        {alerts.length && !openReferral ? <Button title={t('patient.refer')} variant="danger" onPress={refer} /> : null}
        {openReferral ? (
          <Muted>
            {t('referrals.title')}: {t(`urgency.${openReferral.urgency}`)} · {t(`refstatus.${openReferral.status}`)}
          </Muted>
        ) : null}
      </Card>

      <Card>
        <H>{t('patient.history')}</H>
        {visits.length ? visits.map((v) => <VisitRow key={v.id} visit={v} t={t} />) : <Muted>{t('patient.noVisits')}</Muted>}
      </Card>
    </Screen>
  );
}

function vitalsSummary(v?: Vitals): string {
  if (!v) return '';
  const parts: string[] = [];
  if (v.systolic || v.diastolic) parts.push(`BP ${v.systolic ?? '–'}/${v.diastolic ?? '–'}`);
  if (v.hemoglobin != null) parts.push(`Hb ${v.hemoglobin}`);
  if (v.temperatureC != null) parts.push(`${v.temperatureC}°C`);
  if (v.weightKg != null) parts.push(`${v.weightKg} kg`);
  if (v.spo2 != null) parts.push(`SpO₂ ${v.spo2}%`);
  if (v.respRate != null) parts.push(`RR ${v.respRate}`);
  if (v.bloodSugarRandom != null) parts.push(`RBS ${v.bloodSugarRandom}`);
  if (v.bloodSugarFasting != null) parts.push(`FBS ${v.bloodSugarFasting}`);
  return parts.join(' · ');
}

function VisitRow({ visit, t }: { visit: Visit; t: (k: string, p?: Record<string, string | number>) => string }) {
  const syncColor = visit.syncState === 'failed' ? colors.danger : visit.syncState === 'pending' ? colors.risk.medium.fg : colors.muted;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '700', color: colors.text }}>
          {formatDate(visit.visitedAt)} · {t(`status.${visit.status}`)}
          {visit.source === 'voice' ? ' 🎙' : ''}
        </Text>
        {visit.syncState ? <Text style={{ fontSize: 12, color: syncColor }}>{t(`sync.${visit.syncState}`)}</Text> : null}
      </Row>
      {visit.vitals ? <Muted>{vitalsSummary(visit.vitals)}</Muted> : null}
      {visit.vitals?.symptoms?.length ? <Muted>{visit.vitals.symptoms.map((s) => t(`sym.${s}`)).join(', ')}</Muted> : null}
      {visit.notes ? <Text style={{ color: colors.text }}>{visit.notes}</Text> : null}
      {visit.followUpOn ? <Muted>{t('patient.followUp', { date: formatDate(visit.followUpOn) })}</Muted> : null}
    </View>
  );
}
