import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Linking, View } from 'react-native';
import { AlertCard } from '../../../../features/asha/components/AlertCard';
import { patientAgeLabel } from '../../../../features/asha/components/PatientRow';
import { Button, Card, Muted, RiskBadge, Row, Screen, useAshaColors } from '../../../../features/asha/components/ui';
import { eddFromLmp, formatDate, gestationWeeks, isPregnant } from '../../../../features/asha/logic/clinical';
import { urgencyFor } from '../../../../features/asha/logic/rules';
import { useAsha } from '../../../../features/asha/store/AshaContext';
import type { Visit, Vitals } from '../../../../features/asha/types';
import { useTheme } from '../../../../features/shared/theme';
import { Avatar, EmptyState, Icon, Pill, SectionHeader, Text, type IconName } from '../../../../features/shared/ui';

export default function PatientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, store, lang, t, user } = useAsha();
  const theme = useTheme();
  const colors = useAshaColors();
  const patient = db.patients[id];
  const visits = useMemo(() => (patient ? store.visitsFor(patient.id) : []), [db.visits, patient, store]);
  const alerts = useMemo(() => (patient ? store.currentAlerts(patient.id) : []), [db.alerts, db.visits, patient, store]);
  const referrals = useMemo(() => (patient ? store.referralsFor(patient.id) : []), [db.referrals, patient, store]);

  if (!patient) {
    return (
      <Screen>
        <EmptyState icon="person-outline" title={t('patient.notFound')} />
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
      testID="screen-asha-patient"
      footer={<Button title={t('patient.newVisit')} icon="add-circle-outline" onPress={() => router.push(`/asha/visit/${patient.id}`)} testID="new-visit" />}
    >
      <Stack.Screen options={{ title: patient.name }} />
      <Card style={{ borderStartWidth: 4, borderStartColor: colors.risk[risk].bar }}>
        <Row style={{ gap: theme.space[3] }}>
          <Avatar name={patient.name} size="lg" />
          <View style={{ flex: 1, gap: theme.space[1] }}>
            <Text variant="h3" accessibilityRole="header" numberOfLines={2}>
              {patient.name}
            </Text>
            <RiskBadge level={risk} label={t(`risk.${risk}`)} />
          </View>
        </Row>
        <Muted>
          {patient.sex} · {patientAgeLabel(patient, lang)} · {patient.village}
          {patient.address ? ` · ${patient.address}` : ''}
        </Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {patient.categories.map((c) => (
            <Pill key={c} label={t(`cat.${c}`)} tone="accent" />
          ))}
        </View>
        {isPregnant(patient) ? (
          <Text variant="bodySmall" weight="semibold" tone="accent">
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
          <Button title={`${t('patient.call')} ${patient.phone}`} icon="call-outline" variant="secondary" onPress={() => Linking.openURL(`tel:${patient.phone}`)} />
        ) : null}
      </Card>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('patient.currentAlerts')} />
        {alerts.length ? (
          alerts.map((a) => <AlertCard key={a.id} alert={a} lang={lang} onAck={a.acknowledged ? undefined : () => store.acknowledgeAlert(a.id)} />)
        ) : (
          <Card tone="muted" radius="lg" padding="md">
            <Muted>{t('patient.noAlerts')}</Muted>
          </Card>
        )}
        {alerts.length && !openReferral ? <Button title={t('patient.refer')} icon="paper-plane" variant="danger" onPress={refer} /> : null}
        {openReferral ? (
          <StatusNote
            icon="paper-plane-outline"
            label={`${t('referrals.title')}: ${t(`urgency.${openReferral.urgency}`)} · ${t(`refstatus.${openReferral.status}`)}`}
          />
        ) : null}
      </View>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('patient.history')} />
        <Card>{visits.length ? visits.map((v, i) => <VisitRow key={v.id} visit={v} t={t} first={i === 0} />) : <Muted>{t('patient.noVisits')}</Muted>}</Card>
      </View>
    </Screen>
  );
}

/** Info-tinted status line in the shared Pill style, but wrapping: the long referral label never overflows at large text. */
function StatusNote({ icon, label }: { icon: IconName; label: string }) {
  const theme = useTheme();
  const s = theme.colors.status.info;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[2],
        minHeight: theme.sizes.pill,
        paddingHorizontal: theme.space[3],
        paddingVertical: theme.space[1],
        borderRadius: theme.radii.lg,
        backgroundColor: s.bg,
      }}
    >
      <Icon name={icon} size={theme.sizes.icon.xs} color={s.icon} />
      <Text variant="pill" color={s.fg} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </View>
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

function VisitRow({ visit, t, first }: { visit: Visit; t: (k: string, p?: Record<string, string | number>) => string; first?: boolean }) {
  const theme = useTheme();
  const syncColor =
    visit.syncState === 'failed' ? theme.colors.status.danger.fg : visit.syncState === 'pending' ? theme.colors.status.warning.fg : theme.colors.textTertiary;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: theme.colors.divider, paddingTop: first ? 0 : theme.space[3], gap: 2 }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Row style={{ flexShrink: 1, gap: theme.space[1] }}>
          <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
            {formatDate(visit.visitedAt)} · {t(`status.${visit.status}`)}
          </Text>
          {visit.source === 'voice' ? <Icon name="mic" size={theme.sizes.icon.xs} color={theme.accent.accentIcon} /> : null}
        </Row>
        {visit.syncState ? (
          <Text variant="caption" color={syncColor}>
            {t(`sync.${visit.syncState}`)}
          </Text>
        ) : null}
      </Row>
      {visit.vitals ? <Muted>{vitalsSummary(visit.vitals)}</Muted> : null}
      {visit.vitals?.symptoms?.length ? <Muted>{visit.vitals.symptoms.map((s) => t(`sym.${s}`)).join(', ')}</Muted> : null}
      {visit.notes ? <Text variant="bodySmall">{visit.notes}</Text> : null}
      {visit.followUpOn ? <Muted>{t('patient.followUp', { date: formatDate(visit.followUpOn) })}</Muted> : null}
    </View>
  );
}
