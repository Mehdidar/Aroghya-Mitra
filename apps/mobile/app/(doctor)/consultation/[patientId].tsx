import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { applyAction } from '@am/records';
import { DEMO_FACILITY, type Consultation, type Prescription } from '@am/shared';

import { draftToItem, emptyMedicine, newId, remindersFor, SLOTS, type MedicineDraft, type Slot } from '@/features/doctor/prescriptions';
import { useDoctorId, usePatientRecord } from '@/features/doctor/useDoctorData';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, Heading, Icon, IconButton, Pill, PrimaryButton, Screen, SecondaryButton, SectionHeader, Text, TextField } from '@/features/shared/ui';
import { feedback } from '@/features/shared/feedback';

const LAB_OPTIONS = ['CBC', 'Urine protein', 'Blood sugar', 'HbA1c', 'LFT', 'KFT', 'ECG', 'Ultrasound', 'Chest X-ray'];

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: th.sizes.touchMin,
        paddingHorizontal: th.space[4],
        justifyContent: 'center',
        borderRadius: th.radii.full,
        borderWidth: 1.5,
        borderColor: selected ? th.accent.accent : th.colors.border,
        backgroundColor: selected ? th.accent.accentSoft : th.colors.surface,
      }}>
      <Text variant="bodySmall" weight={selected ? 'semibold' : 'regular'}>
        {label}
      </Text>
    </Pressable>
  );
}

/** New consultation: note, diagnosis, lab orders, follow-up, and a prescription that lands in the patient's reminders. */
export default function ConsultationScreen() {
  const { patientId, referralId } = useLocalSearchParams<{ patientId: string; referralId?: string }>();
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const doctorId = useDoctorId();
  const { patient, referrals } = usePatientRecord(patientId);
  const addConsultation = useRecords((s) => s.addConsultation);
  const addPrescription = useRecords((s) => s.addPrescription);
  const updateReferral = useRecords((s) => s.updateReferral);

  const [notes, setNotes] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [labs, setLabs] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState('');
  const [meds, setMeds] = useState<MedicineDraft[]>([emptyMedicine()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const referral = referralId ? referrals.find((r) => r.id === referralId) : undefined;

  if (!patient) {
    return (
      <Screen background="page">
        <EmptyState icon="person-outline" title={t('patient.notFound')} />
      </Screen>
    );
  }

  const setMed = (i: number, patch: Partial<MedicineDraft>) => setMeds((m) => m.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const toggleSlot = (i: number, s: Slot) =>
    setMed(i, { timesOfDay: meds[i].timesOfDay.includes(s) ? meds[i].timesOfDay.filter((x) => x !== s) : [...meds[i].timesOfDay, s] });

  const save = () => {
    setError(null);
    if (!diagnosis.trim() && !notes.trim()) return setError(t('consultation.errorEmpty'));
    if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) return setError(t('consultation.errorDate'));
    const items = meds.filter((m) => m.name.trim()).map(draftToItem);
    if (items.some((it) => !it.timesOfDay?.length)) return setError(t('consultation.errorSlots'));
    setSaving(true);
    const now = new Date();
    let prescription: Prescription | null = null;
    if (items.length) {
      prescription = { id: newId('rx'), patientId: patient.id, prescribedBy: doctorId, source: 'doctor', issuedAt: now.toISOString(), diagnosis: diagnosis.trim() || null, items, notes: notes.trim() || null };
      addPrescription(prescription, remindersFor(prescription, now));
    }
    const consultation: Consultation = {
      id: newId('cons'),
      patientId: patient.id,
      doctorId,
      facilityId: DEMO_FACILITY.id,
      startedAt: now.toISOString(),
      notes: notes.trim() || null,
      diagnosis: diagnosis.trim() || null,
      labOrders: labs,
      followUpDate: followUp || null,
      prescriptionId: prescription?.id ?? null,
      referralId: referral?.id ?? null,
    };
    addConsultation(consultation);
    if (referral) {
      const patch = applyAction(referral, 'accept', now);
      if (patch) updateReferral(referral.id, patch);
    }
    setSaving(false);
    feedback.success(t('consultation.savedAnnounce', { defaultValue: 'Consultation saved' }));
    router.replace({ pathname: '/patient/[id]', params: { id: patient.id } });
  };

  return (
    <Screen
      background="page"
      testID="screen-consultation"
      contentStyle={{ gap: theme.space[5] }}
      footer={<PrimaryButton label={t('consultation.save')} icon="checkmark" loading={saving} onPress={save} testID="consultation-save" />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('back')} flipInRTL onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1 }}>
          <Heading variant="h2">{t('consultation.title')}</Heading>
          <Text tone="secondary">{patient.fullName}</Text>
        </View>
      </View>
      {referral ? <Pill label={t('consultation.fromReferral')} tone="info" icon="paper-plane-outline" /> : null}

      <TextField label={t('consultation.diagnosis')} value={diagnosis} onChangeText={setDiagnosis} placeholder={t('consultation.diagnosisHint')} testID="consultation-diagnosis" />
      <TextField label={t('consultation.notes')} value={notes} onChangeText={setNotes} multiline numberOfLines={4} placeholder={t('consultation.notesHint')} testID="consultation-notes" />

      <View style={{ gap: theme.space[2] }}>
        <Text variant="label">{t('consultation.labOrders')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {LAB_OPTIONS.map((lab) => (
            <Chip key={lab} label={lab} selected={labs.includes(lab)} onPress={() => setLabs((l) => (l.includes(lab) ? l.filter((x) => x !== lab) : [...l, lab]))} />
          ))}
        </View>
      </View>

      <TextField label={t('consultation.followUp')} value={followUp} onChangeText={setFollowUp} placeholder="YYYY-MM-DD" numeric testID="consultation-followup" />

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('consultation.prescription')} actionLabel={t('consultation.addMedicine')} onAction={() => setMeds((m) => [...m, emptyMedicine()])} />
        {meds.map((m, i) => (
          <Card key={i} radius="lg" padding="md" testID={`medicine-${i}`}>
            <View style={{ gap: theme.space[3] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
                <Icon name="medical-outline" size={theme.sizes.icon.sm} color={theme.accent.accentIcon} />
                <Text variant="label" style={{ flex: 1 }}>
                  {t('consultation.medicineN', { n: i + 1 })}
                </Text>
                {meds.length > 1 ? <IconButton icon="trash-outline" accessibilityLabel={t('consultation.removeMedicine')} onPress={() => setMeds((x) => x.filter((_, j) => j !== i))} /> : null}
              </View>
              <TextField label={t('consultation.medName')} value={m.name} onChangeText={(v) => setMed(i, { name: v })} placeholder="Labetalol 100 mg" testID={`medicine-${i}-name`} />
              <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
                <View style={{ flex: 1 }}>
                  <TextField label={t('consultation.dose')} value={m.dosage} onChangeText={(v) => setMed(i, { dosage: v })} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label={t('consultation.durationDays')} value={m.durationDays} onChangeText={(v) => setMed(i, { durationDays: v })} numeric keyboardType="number-pad" />
                </View>
              </View>
              <View style={{ gap: theme.space[2] }}>
                <Text variant="label">{t('consultation.timesOfDay')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                  {SLOTS.map((s) => (
                    <Chip key={s} label={t(`slots.${s}`)} selected={m.timesOfDay.includes(s)} onPress={() => toggleSlot(i, s)} testID={`medicine-${i}-slot-${s}`} />
                  ))}
                </View>
              </View>
              <TextField label={t('consultation.instructions')} value={m.instructions} onChangeText={(v) => setMed(i, { instructions: v })} placeholder={t('consultation.instructionsHint')} />
            </View>
          </Card>
        ))}
      </View>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite" testID="consultation-error">
          {error}
        </Text>
      ) : null}
      <SecondaryButton label={t('cancel')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
