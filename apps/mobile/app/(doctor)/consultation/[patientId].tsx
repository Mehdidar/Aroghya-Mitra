import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { applyAction } from '@am/records';
import { DEMO_FACILITY, type Consultation, type Prescription } from '@am/shared';
import type { ConsultationNoteDraft } from '@server/copilot/notesSchema';

import { Chip } from '@/features/doctor/components/Chip';
import { MedicineEditor } from '@/features/doctor/components/MedicineEditor';
import { VoiceNotes } from '@/features/doctor/components/VoiceNotes';
import { WarningsPanel } from '@/features/doctor/components/WarningsPanel';
import { composeNotes, emptyNoteFields, fieldsFromDraft, followUpDate, medicinesFromDraft, type NoteFields } from '@/features/doctor/consultationNote';
import { draftToItem, emptyMedicine, newId, remindersFor, type MedicineDraft } from '@/features/doctor/prescriptions';
import { useDoctorId, usePatientRecord } from '@/features/doctor/useDoctorData';
import { usePrescriptionSafety } from '@/features/doctor/usePrescriptionSafety';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, Heading, IconButton, Pill, PrimaryButton, Screen, SecondaryButton, SectionHeader, Text, TextField } from '@/features/shared/ui';
import { feedback } from '@/features/shared/feedback';

const LAB_OPTIONS = ['CBC', 'Urine protein', 'Blood sugar', 'HbA1c', 'LFT', 'KFT', 'ECG', 'Ultrasound', 'Chest X-ray'];

/**
 * New consultation with the copilot: dictate → structured draft → the doctor
 * edits every field → checks the prescription warnings → "Approve and save".
 * Nothing is saved before that press, and no prescription is ever issued
 * automatically: it reaches the patient's reminders only on save.
 */
export default function ConsultationScreen() {
  const { patientId, referralId } = useLocalSearchParams<{ patientId: string; referralId?: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('copilot');
  const theme = useTheme();
  const doctorId = useDoctorId();
  const rec = usePatientRecord(patientId);
  const { patient, referrals } = rec;
  const addConsultation = useRecords((s) => s.addConsultation);
  const addPrescription = useRecords((s) => s.addPrescription);
  const updateReferral = useRecords((s) => s.updateReferral);

  const [f, setF] = useState<NoteFields>(emptyNoteFields());
  const [labs, setLabs] = useState<string[]>([]);
  const [customLab, setCustomLab] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [meds, setMeds] = useState<MedicineDraft[]>([emptyMedicine()]);
  const [fromDictation, setFromDictation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const referral = referralId ? referrals.find((r) => r.id === referralId) : undefined;
  const { current, pregnant, pregnancyWeeks, togglePregnant, filled, warnings, acked, toggleAck, allReviewed } = usePrescriptionSafety(rec, meds);

  if (!patient) {
    return (
      <Screen background="page">
        <EmptyState icon="person-outline" title={t('patient.notFound')} />
      </Screen>
    );
  }

  const set = (patch: Partial<NoteFields>) => setF((x) => ({ ...x, ...patch }));
  const setMed = (i: number, patch: Partial<MedicineDraft>) => setMeds((m) => m.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const applyDraft = (d: ConsultationNoteDraft) => {
    setF(fieldsFromDraft(d));
    setLabs((l) => [...new Set([...l, ...d.labOrders])]);
    const fu = followUpDate(d.followUp);
    if (fu) setFollowUp(fu);
    const fromNote = medicinesFromDraft(d);
    if (fromNote.length) setMeds(fromNote);
    setFromDictation(true);
    feedback.success(tc('notes.drafted'));
  };

  const save = () => {
    setError(null);
    const diagnosis = f.assessment.trim();
    const notes = composeNotes(f, { chiefComplaint: tc('form.chiefComplaint'), history: tc('form.history'), examination: tc('form.examination'), vitals: tc('form.vitals'), plan: tc('form.plan'), followUp: tc('form.followUpText') });
    if (!diagnosis && !notes) return setError(t('consultation.errorEmpty'));
    if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) return setError(t('consultation.errorDate'));
    const items = filled.map(draftToItem);
    if (items.some((it) => !it.timesOfDay?.length)) return setError(t('consultation.errorSlots'));
    if (!allReviewed) return setError(tc('warn.mustAck'));
    setSaving(true);
    const now = new Date();
    let prescription: Prescription | null = null;
    if (items.length) {
      prescription = { id: newId('rx'), patientId: patient.id, prescribedBy: doctorId, source: 'doctor', issuedAt: now.toISOString(), diagnosis: diagnosis || null, items, notes: f.plan.trim() || null };
      addPrescription(prescription, remindersFor(prescription, now));
    }
    const consultation: Consultation = {
      id: newId('cons'),
      patientId: patient.id,
      doctorId,
      facilityId: DEMO_FACILITY.id,
      startedAt: now.toISOString(),
      notes,
      diagnosis: diagnosis || null,
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

  const field = (key: keyof NoteFields, label: string, opts: { multiline?: boolean; numeric?: boolean; testID?: string; placeholder?: string } = {}) => (
    <TextField label={label} value={f[key]} onChangeText={(v) => set({ [key]: v } as Partial<NoteFields>)} multiline={opts.multiline} numberOfLines={opts.multiline ? 3 : undefined} numeric={opts.numeric} keyboardType={opts.numeric ? 'decimal-pad' : undefined} placeholder={opts.placeholder} testID={opts.testID} />
  );

  return (
    <Screen
      background="page"
      testID="screen-consultation"
      contentStyle={{ gap: theme.space[5] }}
      footer={<PrimaryButton label={tc('form.approve')} icon="checkmark-done" loading={saving} onPress={save} testID="consultation-save" />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('back')} flipInRTL onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1 }}>
          <Heading variant="h2">{t('consultation.title')}</Heading>
          <Text tone="secondary">{patient.fullName}</Text>
        </View>
      </View>
      {referral ? <Pill label={t('consultation.fromReferral')} tone="info" icon="paper-plane-outline" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {patient.allergies.length ? <Pill label={tc('summary.allergyPill', { list: patient.allergies.join(', ') })} tone="danger" icon="alert-circle" /> : null}
      </View>

      <VoiceNotes patientId={patient.id} onDraft={applyDraft} />
      {fromDictation ? <Pill label={tc('form.fromDictation')} tone="warning" icon="sparkles-outline" /> : null}

      <SectionHeader title={tc('form.noteTitle')} />
      {field('chiefComplaint', tc('form.chiefComplaint'), { testID: 'note-complaint' })}
      {field('history', tc('form.history'), { multiline: true, testID: 'note-history' })}
      {field('examination', tc('form.examination'), { multiline: true, testID: 'note-exam' })}
      <Card radius="lg" padding="md">
        <View style={{ gap: theme.space[2] }}>
          <Text variant="label">{tc('form.vitals')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>{field('bp', tc('form.bp'), { numeric: true, placeholder: '120/80', testID: 'note-bp' })}</View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>{field('pulse', tc('form.pulse'), { numeric: true, testID: 'note-pulse' })}</View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>{field('temperature', tc('form.temperature'), { numeric: true, testID: 'note-temp' })}</View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>{field('spo2', tc('form.spo2'), { numeric: true, testID: 'note-spo2' })}</View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>{field('weight', tc('form.weight'), { numeric: true, testID: 'note-weight' })}</View>
          </View>
        </View>
      </Card>
      <TextField label={tc('form.assessment')} value={f.assessment} onChangeText={(v) => set({ assessment: v })} placeholder={t('consultation.diagnosisHint')} testID="consultation-diagnosis" />
      {field('plan', tc('form.plan'), { multiline: true, testID: 'note-plan' })}
      <TextField label={t('consultation.notes')} value={f.notes} onChangeText={(v) => set({ notes: v })} multiline numberOfLines={3} placeholder={t('consultation.notesHint')} testID="consultation-notes" />

      <View style={{ gap: theme.space[2] }}>
        <Text variant="label">{t('consultation.labOrders')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {[...LAB_OPTIONS, ...labs.filter((l) => !LAB_OPTIONS.includes(l))].map((lab) => (
            <Chip key={lab} label={lab} selected={labs.includes(lab)} onPress={() => setLabs((l) => (l.includes(lab) ? l.filter((x) => x !== lab) : [...l, lab]))} />
          ))}
        </View>
        <TextField
          label={tc('form.otherLab')}
          value={customLab}
          onChangeText={setCustomLab}
          onSubmitEditing={() => {
            if (customLab.trim()) setLabs((l) => [...new Set([...l, customLab.trim()])]);
            setCustomLab('');
          }}
          returnKeyType="done"
        />
      </View>

      {field('followUpText', tc('form.followUpText'), { testID: 'note-followup-text' })}
      <TextField label={t('consultation.followUp')} value={followUp} onChangeText={setFollowUp} placeholder="YYYY-MM-DD" numeric testID="consultation-followup" />

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('consultation.prescription')} actionLabel={t('consultation.addMedicine')} onAction={() => setMeds((m) => [...m, emptyMedicine()])} />
        <Text variant="caption" tone="tertiary">
          {tc('rx.listNote')}
        </Text>
        {current.length ? (
          <Text variant="bodySmall" tone="secondary">
            {tc('rx.current', { list: current.map((m) => m.name).join(', ') })}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2], alignItems: 'center' }}>
          <Chip
            label={pregnant ? (pregnancyWeeks ? tc('summary.pregnantWeeks', { n: pregnancyWeeks }) : tc('summary.pregnant')) : tc('rx.notPregnant')}
            selected={pregnant}
            onPress={togglePregnant}
            accessibilityLabel={tc('rx.pregnantToggle')}
            testID="rx-pregnant"
          />
        </View>
        {meds.map((m, i) => (
          <MedicineEditor key={i} index={i} value={m} onChange={(p) => setMed(i, p)} onRemove={meds.length > 1 ? () => setMeds((x) => x.filter((_, j) => j !== i)) : undefined} />
        ))}
        <WarningsPanel warnings={warnings} acknowledged={acked} onToggle={toggleAck} />
      </View>
      <Text variant="caption" tone="tertiary">
        {tc('form.approveNote')}
      </Text>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite" testID="consultation-error">
          {error}
        </Text>
      ) : null}
      <SecondaryButton label={t('cancel')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
