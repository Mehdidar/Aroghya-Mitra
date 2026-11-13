import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { AlertCard } from '../../../../features/asha/components/AlertCard';
import { Button, Card, Chip, ChipRow, Field, H, Muted, Row, Screen, useAshaColors } from '../../../../features/asha/components/ui';
import { addDays, isNewborn, isPregnant } from '../../../../features/asha/logic/clinical';
import { evaluateVisit, SEVERITY_RANK, urgencyFor } from '../../../../features/asha/logic/rules';
import { mergeParsed, parseTranscript, type ParsedVitals } from '../../../../features/asha/logic/transcript';
import { useAsha } from '../../../../features/asha/store/AshaContext';
import { newId } from '../../../../features/asha/store/store';
import type { GeoPoint, Patient, Symptom, Visit, VisitStatus, Vitals } from '../../../../features/asha/types';
import { sttConfigured } from '../../../../features/asha/voice/sarvam';
import { useVoiceReport } from '../../../../features/asha/voice/useVoiceReport';
import { useTheme } from '../../../../features/shared/theme';
import { EmptyState, GlowOrb, Icon, Text } from '../../../../features/shared/ui';

type NumField = Exclude<keyof Vitals, 'recordedAt' | 'symptoms' | 'fetalMovement'>;

/** Plausible ranges: values outside are almost certainly typos and block saving. */
const RANGES: Record<NumField, [number, number]> = {
  systolic: [50, 280],
  diastolic: [30, 180],
  hemoglobin: [2, 22],
  weightKg: [0.4, 250],
  temperatureC: [30, 43],
  pulse: [30, 250],
  respRate: [8, 120],
  spo2: [50, 100],
  bloodSugarRandom: [20, 700],
  bloodSugarFasting: [20, 600],
};

const PREG_SYMPTOMS: Symptom[] = ['bleeding_pv', 'severe_headache', 'blurred_vision', 'convulsions', 'swelling_face_hands', 'leaking_fluid', 'severe_abdominal_pain', 'fever'];
const NEWBORN_SYMPTOMS: Symptom[] = ['not_feeding', 'convulsions', 'chest_indrawing', 'lethargy', 'cold_to_touch', 'fever', 'jaundice', 'umbilical_redness'];
const GENERAL_SYMPTOMS: Symptom[] = ['fever', 'breathlessness', 'chest_pain', 'cough_2_weeks', 'hemoptysis', 'weight_loss', 'night_sweats', 'convulsions'];

function fieldsFor(p: Patient): NumField[] {
  if (isNewborn(p)) return ['weightKg', 'temperatureC', 'respRate', 'spo2'];
  const base: NumField[] = ['systolic', 'diastolic', 'weightKg', 'temperatureC', 'pulse', 'spo2'];
  if (isPregnant(p)) return [...base, 'hemoglobin'];
  return [...base, 'hemoglobin', 'respRate', 'bloodSugarRandom', 'bloodSugarFasting'];
}

function symptomsFor(p: Patient): Symptom[] {
  const list = isNewborn(p) ? NEWBORN_SYMPTOMS : isPregnant(p) ? [...PREG_SYMPTOMS, 'breathlessness' as Symptom] : GENERAL_SYMPTOMS;
  return [...new Set(list)];
}

const toText = (v: ParsedVitals): Partial<Record<NumField, string>> =>
  Object.fromEntries(Object.keys(RANGES).filter((k) => v[k as NumField] != null).map((k) => [k, String(v[k as NumField])]));

export default function NewVisit() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { db, store, user, lang, t } = useAsha();
  const theme = useTheme();
  const colors = useAshaColors();
  const patient = db.patients[patientId];
  // Fixed for the life of the screen (lazy state rather than ref.current, which is not read during render).
  const [visitId] = useState(() => newId('visit'));
  const [startedAt] = useState(() => new Date().toISOString());

  const [values, setValues] = useState<Partial<Record<NumField, string>>>({});
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [fetal, setFetal] = useState<Vitals['fetalMovement']>();
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [status, setStatus] = useState<VisitStatus>('completed');
  const [followDays, setFollowDays] = useState<number | null>(null);
  const [transcript, setTranscript] = useState('');
  const [usedVoice, setUsedVoice] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [gps, setGps] = useState<GeoPoint | 'pending' | 'off'>('pending');
  const [saving, setSaving] = useState(false);
  const voice = useVoiceReport(lang);

  // Capture location in the background; never block the visit on it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return !cancelled && setGps('off');
        const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
        if (last && !cancelled) setGps({ lat: last.coords.latitude, lng: last.coords.longitude, accuracyM: last.coords.accuracy ?? undefined });
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? undefined });
      } catch {
        if (!cancelled) setGps((g) => (typeof g === 'object' ? g : 'off'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const numeric = useMemo(() => {
    const out: Partial<Record<NumField, number>> = {};
    const bad: NumField[] = [];
    for (const [k, raw] of Object.entries(values) as [NumField, string][]) {
      if (!raw?.trim()) continue;
      const n = Number(raw.replace(',', '.'));
      const [lo, hi] = RANGES[k];
      if (!Number.isFinite(n) || n < lo || n > hi) bad.push(k);
      else out[k] = n;
    }
    return { out, bad };
  }, [values]);

  const draft: Visit | null = useMemo(() => {
    if (!patient) return null;
    const followUpOn = followDays ? addDays(new Date(), followDays) : undefined;
    return {
      id: visitId,
      patientId: patient.id,
      ashaId: user.id,
      visitedAt: startedAt,
      status: followUpOn && status === 'completed' ? 'follow_up' : status,
      gps: typeof gps === 'object' ? gps : undefined,
      vitals: { recordedAt: startedAt, ...numeric.out, symptoms: symptoms.length ? symptoms : undefined, fetalMovement: fetal },
      notes: notes.trim() || undefined,
      photos,
      followUpOn,
      source: usedVoice ? 'voice' : 'manual',
      transcript: transcript.trim() || undefined,
      updatedAt: startedAt,
    };
  }, [patient, visitId, user.id, startedAt, status, gps, numeric.out, symptoms, fetal, notes, photos, followDays, usedVoice, transcript]);

  // Live risk preview as the ASHA types: the same engine that runs on save.
  const preview = useMemo(() => (patient && draft ? evaluateVisit(patient, draft, lang) : []), [patient, draft, lang]);

  if (!patient || !draft) {
    return (
      <Screen>
        <EmptyState icon="person-outline" title={t('patient.notFound')} />
      </Screen>
    );
  }

  // Functional updates: this also runs from the voice callback, after state may have changed.
  const applyTranscript = (text: string) => {
    const parsed = parseTranscript(text);
    const { filled } = mergeParsed({ ...numeric.out, symptoms, fetalMovement: fetal }, parsed);
    const parsedText = toText(parsed);
    setValues((v) => {
      const next = { ...v };
      for (const [k, s] of Object.entries(parsedText) as [NumField, string][]) if (!next[k]?.trim()) next[k] = s;
      return next;
    });
    if (parsed.symptoms?.length) setSymptoms((cur) => [...new Set([...cur, ...parsed.symptoms!])]);
    if (parsed.fetalMovement) setFetal((cur) => cur ?? parsed.fetalMovement);
    setUsedVoice(true);
    setApplied(filled.length ? t('visit.applied', { fields: filled.map((f) => (f === 'symptoms' ? t('visit.symptoms') : f === 'fetalMovement' ? t('visit.fetalMovement') : t(`v.${f}`))).join(', ') }) : t('visit.nothingFound'));
  };

  const onRecord = () => {
    if (voice.state === 'recording') return void voice.stop();
    void voice.start((text) => {
      setTranscript((prev) => (prev ? `${prev} ${text}` : text));
      if (text) applyTranscript(text);
    });
  };

  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('', t('visit.cameraDenied'));
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, exif: false });
    if (!res.canceled && res.assets[0]) setPhotos((p) => [...p, res.assets[0].uri]);
  };

  const save = async () => {
    if (numeric.bad.length) {
      Alert.alert('', t('form.invalid', { fields: numeric.bad.map((k) => t(`v.${k}`)).join(', ') }));
      return;
    }
    setSaving(true);
    try {
      const { visit, alerts } = await store.recordVisit(draft, lang);
      const serious = alerts.filter((a) => SEVERITY_RANK[a.severity] >= SEVERITY_RANK.high);
      if (serious.length) {
        const urgency = urgencyFor(serious);
        Alert.alert(t('visit.referPrompt'), t('visit.referPromptBody', { n: serious.length, urgency: t(`urgency.${urgency}`) }), [
          { text: t('visit.referNo'), style: 'cancel', onPress: () => router.back() },
          {
            text: t('visit.referYes'),
            style: 'destructive',
            onPress: async () => {
              await store.createReferral({ patientId: patient.id, fromAshaId: user.id, alertIds: alerts.map((a) => a.id), urgency, visitId: visit.id });
              router.back();
            },
          },
        ]);
      } else {
        router.back();
      }
    } finally {
      setSaving(false);
    }
  };

  const fields = fieldsFor(patient);
  const symptomOptions = symptomsFor(patient);
  const toggleSymptom = (s: Symptom) => setSymptoms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <Screen
      testID="screen-asha-visit"
      footer={<Button title={t('visit.save')} icon="checkmark-circle-outline" onPress={save} loading={saving} disabled={voice.state === 'recording' || voice.state === 'transcribing'} testID="save-visit" />}
    >
      <Stack.Screen options={{ title: `${t('visit.title')} · ${patient.name}` }} />

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <H>{t('visit.voice')}</H>
          <Text variant="caption" tone="tertiary" style={{ flexShrink: 1 }} align="end">
            {gps === 'pending' ? t('visit.gpsPending') : gps === 'off' ? t('visit.gpsOff') : t('visit.gps', { m: Math.round(gps.accuracyM ?? 0) })}
          </Text>
        </Row>
        <Muted>{t('visit.voiceHint')}</Muted>
        {sttConfigured() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: voice.state === 'transcribing', disabled: voice.state === 'transcribing' }}
            accessibilityLabel={voice.state === 'recording' ? t('visit.stop') : voice.state === 'transcribing' ? t('visit.transcribing') : t('visit.record')}
            disabled={voice.state === 'transcribing'}
            onPress={onRecord}
            testID="voice-record"
            style={({ pressed }) => ({
              alignSelf: 'center',
              alignItems: 'center',
              gap: theme.space[3],
              paddingVertical: theme.space[3],
              transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
            })}
          >
            <GlowOrb size={theme.sizes.orb.mini + 32}>
              <Icon
                name={voice.state === 'recording' ? 'stop' : voice.state === 'transcribing' ? 'hourglass-outline' : 'mic'}
                size={theme.sizes.icon.xl}
                color={voice.state === 'recording' ? theme.colors.status.danger.solid : theme.accent.accentSoftText}
              />
            </GlowOrb>
            <Text variant="label" align="center" color={voice.state === 'recording' ? theme.colors.status.danger.fg : theme.colors.textPrimary}>
              {voice.state === 'recording'
                ? t('visit.stopCta', { s: voice.seconds, max: voice.maxSeconds })
                : voice.state === 'transcribing'
                  ? t('visit.transcribing')
                  : t('visit.recordCta')}
            </Text>
          </Pressable>
        ) : null}
        {voice.error ? (
          <Text variant="bodySmall" tone="danger">
            {voice.error.kind === 'permission' ? t('visit.micDenied') : t('visit.sttUnavailable')}
          </Text>
        ) : !sttConfigured() ? (
          <Muted>{t('visit.sttUnavailable')}</Muted>
        ) : null}
        <Field label={t('visit.transcript')} value={transcript} onChangeText={setTranscript} multiline />
        {transcript.trim() ? <Button title={t('visit.applyTranscript')} icon="sparkles-outline" variant="secondary" onPress={() => applyTranscript(transcript)} /> : null}
        {applied ? (
          <Text variant="bodySmall" weight="semibold" tone="accent">
            {applied}
          </Text>
        ) : null}
      </Card>

      <Card>
        <H>{t('visit.vitals')}</H>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[3] }}>
          {fields.map((f) => (
            <Field
              key={f}
              label={t(`v.${f}`)}
              value={values[f] ?? ''}
              onChangeText={(s) => setValues((v) => ({ ...v, [f]: s }))}
              keyboardType="decimal-pad"
              error={numeric.bad.includes(f)}
              style={{ flexBasis: '45%', flexGrow: 1 }}
            />
          ))}
        </View>
        {isPregnant(patient) ? (
          <>
            <H>{t('visit.fetalMovement')}</H>
            <ChipRow>
              {(['normal', 'reduced', 'absent'] as const).map((fm) => (
                <Chip key={fm} label={t(`fm.${fm}`)} selected={fetal === fm} tone={fm === 'normal' ? undefined : 'danger'} onPress={() => setFetal(fetal === fm ? undefined : fm)} />
              ))}
            </ChipRow>
          </>
        ) : null}
      </Card>

      <Card>
        <H>{t('visit.symptoms')}</H>
        <ChipRow>
          {symptomOptions.map((s) => (
            <Chip key={s} label={t(`sym.${s}`)} selected={symptoms.includes(s)} tone="danger" onPress={() => toggleSymptom(s)} />
          ))}
          {symptoms
            .filter((s) => !symptomOptions.includes(s))
            .map((s) => (
              <Chip key={s} label={t(`sym.${s}`)} selected tone="danger" onPress={() => toggleSymptom(s)} />
            ))}
        </ChipRow>
      </Card>

      <Card style={{ borderColor: preview.length ? colors.risk[preview[0].severity].bar : colors.border, borderWidth: preview.length ? 2 : 1 }}>
        <H>{t('visit.riskPreview')}</H>
        {preview.length ? preview.map((a) => <AlertCard key={a.id} alert={a} lang={lang} compact />) : <Muted>{t('visit.noRisk')}</Muted>}
      </Card>

      <Card>
        <H>{t('visit.status')}</H>
        <ChipRow>
          {(['completed', 'not_at_home'] as VisitStatus[]).map((s) => (
            <Chip key={s} label={t(`status.${s}`)} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </ChipRow>
        <H>{t('visit.followUpIn')}</H>
        <ChipRow>
          <Chip label={t('visit.none')} selected={followDays == null} onPress={() => setFollowDays(null)} />
          {[1, 3, 7, 14, 30].map((d) => (
            <Chip key={d} label={t('visit.days', { n: d })} selected={followDays === d} onPress={() => setFollowDays(d)} />
          ))}
        </ChipRow>
        <Field label={t('visit.notes')} value={notes} onChangeText={setNotes} multiline />
        <H>{t('visit.photos')}</H>
        <Row style={{ flexWrap: 'wrap', gap: theme.space[3] }}>
          {photos.map((uri, i) => (
            <Pressable
              key={uri}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${t('visit.photos')} ${i + 1}`}
              onLongPress={() => setPhotos((p) => p.filter((x) => x !== uri))}
            >
              <Image source={{ uri }} style={{ width: 88, height: 88, borderRadius: theme.radii.md }} />
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('visit.addPhotoCta')}
            onPress={addPhoto}
            testID="add-photo"
            // min sizes (not fixed): the label can wrap at large text without being clipped.
            style={({ pressed }) => ({
              minWidth: 88,
              minHeight: 88,
              maxWidth: 140,
              borderRadius: theme.radii.md,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: theme.colors.borderDashed,
              backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surfaceMuted,
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.space[1],
              padding: theme.space[1],
            })}
          >
            <Icon name="camera-outline" size={theme.sizes.icon.md} color={theme.accent.accentIcon} />
            <Text variant="caption" weight="semibold" align="center">
              {t('visit.addPhotoCta')}
            </Text>
          </Pressable>
        </Row>
      </Card>
    </Screen>
  );
}
