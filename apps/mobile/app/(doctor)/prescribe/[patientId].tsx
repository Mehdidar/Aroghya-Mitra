import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Prescription } from '@am/shared';

import { Chip } from '@/features/doctor/components/Chip';
import { MedicineEditor } from '@/features/doctor/components/MedicineEditor';
import { WarningsPanel } from '@/features/doctor/components/WarningsPanel';
import { ageFrom, draftToItem, emptyMedicine, newId, remindersFor, type MedicineDraft } from '@/features/doctor/prescriptions';
import { useDoctorId, usePatientRecord } from '@/features/doctor/useDoctorData';
import { usePrescriptionSafety } from '@/features/doctor/usePrescriptionSafety';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';
import { useRecords } from '@/features/shared/data/recordsStore';
import { feedback } from '@/features/shared/feedback';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, Heading, Icon, IconButton, Pill, PrimaryButton, Screen, SecondaryButton, SectionHeader, Text, TextField } from '@/features/shared/ui';

/**
 * Prescribe medicine without a full consultation. The same safety checks as
 * the consultation screen run before saving (every warning needs the doctor's
 * "I have reviewed this"), and the prescription goes the same way: the
 * records store → outbox (POST /records/push, in the doctor's own name) →
 * the patient's reminders.
 */
export default function PrescribeScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('copilot');
  const theme = useTheme();
  const role = useSession((s) => s.role);
  const doctorId = useDoctorId();
  const rec = usePatientRecord(patientId);
  const addPrescription = useRecords((s) => s.addPrescription);

  const [meds, setMeds] = useState<MedicineDraft[]>([emptyMedicine()]);
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Prescription | null>(null);
  const safety = usePrescriptionSafety(rec, meds);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const header = (subtitle?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
      <IconButton icon="arrow-back" accessibilityLabel={t('back')} flipInRTL onPress={back} />
      <View style={{ flex: 1 }}>
        <Heading variant="h2">{t('prescribe.title')}</Heading>
        {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      </View>
    </View>
  );

  const patient = rec.patient;
  if (!patient) {
    return (
      <Screen background="page" testID="screen-prescribe">
        {header()}
        <EmptyState icon="person-outline" title={t('patient.notFound')} body={t('patient.notFoundBody')} />
      </Screen>
    );
  }
  // The server keeps doctors' prescriptions in the prescribing doctor's own name only.
  if (role !== 'doctor') {
    return (
      <Screen background="page" testID="screen-prescribe" contentStyle={{ gap: theme.space[5] }}>
        {header(patient.fullName)}
        <EmptyState icon="lock-closed-outline" title={t('prescribe.doctorsOnly')} body={t('prescribe.doctorsOnlyBody')} />
      </Screen>
    );
  }

  const toPatient = () => router.replace({ pathname: '/patient/[id]', params: { id: patient.id } });

  if (sent) {
    return (
      <Screen background="page" testID="screen-prescribe" contentStyle={{ gap: theme.space[5] }}>
        {header(patient.fullName)}
        <Card radius="xl" padding="lg" testID="prescribe-sent">
          <View style={{ gap: theme.space[3] }} accessibilityLiveRegion="polite">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
              <Icon name="checkmark-circle" size={theme.sizes.icon.lg} color={theme.colors.status.success.icon} />
              <Heading variant="h3" style={{ flex: 1 }}>
                {t('prescribe.sentTitle', { name: patient.fullName })}
              </Heading>
            </View>
            {sent.items.map((it, i) => (
              <Text key={i} variant="bodySmall">
                {`${it.name} · ${it.dosage} · ${(it.timesOfDay ?? []).map((s) => t(`slots.${s}`)).join(', ')}${it.durationDays ? ` · ${t('rx.days', { n: it.durationDays })}` : ''}`}
              </Text>
            ))}
            <Text variant="bodySmall" tone="secondary">
              {t('prescribe.sentBody')}
            </Text>
          </View>
        </Card>
        <PrimaryButton label={t('prescribe.done')} icon="person-outline" onPress={toPatient} testID="prescribe-done" />
        <SecondaryButton
          label={t('prescribe.another')}
          icon="add"
          onPress={() => {
            setSent(null);
            setMeds([emptyMedicine()]);
            setDiagnosis('');
            setNotes('');
          }}
          testID="prescribe-another"
        />
      </Screen>
    );
  }

  const age = ageFrom(patient.dateOfBirth);
  const setMed = (i: number, patch: Partial<MedicineDraft>) => setMeds((m) => m.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const save = () => {
    setError(null);
    const items = safety.filled.map(draftToItem);
    if (!items.length) return setError(t('prescribe.errorEmpty'));
    if (items.some((it) => !it.timesOfDay?.length)) return setError(t('consultation.errorSlots'));
    if (!safety.allReviewed) return setError(tc('warn.mustAck'));
    const now = new Date();
    const prescription: Prescription = {
      id: newId('rx'),
      patientId: patient.id,
      prescribedBy: doctorId,
      source: 'doctor',
      issuedAt: now.toISOString(),
      diagnosis: diagnosis.trim() || null,
      items,
      notes: notes.trim() || null,
    };
    addPrescription(prescription, remindersFor(prescription, now));
    feedback.success(t('prescribe.sentTitle', { name: patient.fullName }));
    setSent(prescription);
  };

  return (
    <Screen
      background="page"
      testID="screen-prescribe"
      contentStyle={{ gap: theme.space[5] }}
      footer={<PrimaryButton label={t('prescribe.save')} icon="paper-plane-outline" onPress={save} testID="prescribe-save" />}>
      {header(patient.fullName)}
      <ScreenGuide id="prescribe" />
      <Text tone="secondary">{t('prescribe.intro')}</Text>

      <Card radius="lg" padding="md" testID="prescribe-patient">
        <View style={{ gap: theme.space[2] }}>
          {age !== null || patient.sex || patient.area ? (
            <Text variant="bodySmall" tone="secondary">
              {[age !== null ? t('patient.age', { age }) : null, patient.sex ? t(`sex.${patient.sex}`) : null, patient.area].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            {patient.allergies.length ? (
              <Pill label={tc('summary.allergyPill', { list: patient.allergies.join(', ') })} tone="danger" icon="alert-circle" />
            ) : (
              <Pill label={t('prescribe.noAllergies')} tone="neutral" icon="information-circle-outline" />
            )}
          </View>
          {safety.current.length ? (
            <Text variant="bodySmall" tone="secondary">
              {tc('rx.current', { list: safety.current.map((m) => m.name).join(', ') })}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            <Chip
              label={safety.pregnant ? (safety.pregnancyWeeks ? tc('summary.pregnantWeeks', { n: safety.pregnancyWeeks }) : tc('summary.pregnant')) : tc('rx.notPregnant')}
              selected={safety.pregnant}
              onPress={safety.togglePregnant}
              accessibilityLabel={tc('rx.pregnantToggle')}
              testID="rx-pregnant"
            />
          </View>
        </View>
      </Card>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('prescribe.medicines')} actionLabel={t('consultation.addMedicine')} onAction={() => setMeds((m) => [...m, emptyMedicine()])} />
        <Text variant="caption" tone="tertiary">
          {tc('rx.listNote')}
        </Text>
        {meds.map((m, i) => (
          <MedicineEditor key={i} index={i} value={m} onChange={(p) => setMed(i, p)} onRemove={meds.length > 1 ? () => setMeds((x) => x.filter((_, j) => j !== i)) : undefined} />
        ))}
      </View>

      <TextField label={t('prescribe.diagnosis')} value={diagnosis} onChangeText={setDiagnosis} placeholder={t('consultation.diagnosisHint')} testID="prescribe-diagnosis" />
      <TextField label={t('prescribe.notes')} value={notes} onChangeText={setNotes} multiline numberOfLines={3} placeholder={t('prescribe.notesHint')} testID="prescribe-notes" />

      <WarningsPanel warnings={safety.warnings} acknowledged={safety.acked} onToggle={safety.toggleAck} />
      <Text variant="caption" tone="tertiary">
        {t('prescribe.reviewNote')}
      </Text>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite" testID="prescribe-error">
          {error}
        </Text>
      ) : null}
      <SecondaryButton label={t('cancel')} onPress={back} />
    </Screen>
  );
}
