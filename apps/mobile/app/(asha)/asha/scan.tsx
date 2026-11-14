import { DEMO_IDS } from '@am/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { addScannedPatient, scanPatientCard, type ScanResult } from '@/features/ashaConnect/api';
import type { ScanSummary } from '@/features/ashaConnect/types';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';
import { feedback } from '@/features/shared/feedback';

import { Button, Card, H, Muted, RiskBadge, Screen } from '../../../features/asha/components/ui';
import { findPatient } from '../../../features/asha/connect/inbox';
import { Notice, formatWhen, symptomLabel, type T } from '../../../features/asha/connect/ui';
import { formatDate } from '../../../features/asha/logic/clinical';
import { config } from '../../../features/asha/services/config';
import { useAsha } from '../../../features/asha/store/AshaContext';
import { useTheme } from '../../../features/shared/theme';
import { ErrorState, Pill, SecondaryButton, Text, TextField } from '../../../features/shared/ui';

/** Same offline demo card as the doctor's scan (features/doctor/qrScan.ts): only works while the server has no real QR secret. */
const DEMO_PAYLOAD = `AM1.demo.${DEMO_IDS.patientRecord}`;

const REFRESH = new Set(['expired', 'invalid', 'malformed']);
const KNOWN = new Set(['consent_off', 'token_already_used', 'not_aroghya_qr', 'forbidden_role', 'offline', 'no_patient', 'inactive_account']);
function scanError(reason: string, t: T): string {
  if (REFRESH.has(reason)) return t('scan.err.refresh');
  return t(KNOWN.has(reason) ? `scan.err.${reason}` : 'scan.err.generic');
}

/** ASHA scans a patient's QR health card: what she needs for a home visit, and whether the patient is hers. */
export default function AshaScan() {
  const { t } = useAsha();
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [payload, setPayload] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const handled = useRef(false);

  const hasServer = !!config.apiUrl;
  const canUseCamera = Platform.OS !== 'web' && permission?.granted;

  const resolve = async (text: string) => {
    const code = text.trim();
    if (busy || !code) return;
    setBusy(true);
    setError(null);
    const r = await scanPatientCard(code);
    setBusy(false);
    if (r.ok) {
      setResult(r);
      feedback.success(r.summary.patient.fullName);
    } else {
      handled.current = false;
      const msg = scanError(r.reason, t);
      setError(msg);
      feedback.warn(msg);
    }
  };

  const reset = () => {
    handled.current = false;
    setResult(null);
    setError(null);
    setPayload('');
  };

  if (result) {
    return (
      <Screen testID="screen-asha-scan" footer={<SecondaryButton label={t('scan.again')} icon="qr-code-outline" onPress={reset} testID="asha-scan-again" />}>
        <Stack.Screen options={{ title: t('scan.title') }} />
        <ScreenGuide id="ashaScan" />
        <ScanResultView result={result} />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-asha-scan">
      <Stack.Screen options={{ title: t('scan.title') }} />
      <ScreenGuide id="ashaScan" />
      <Text tone="secondary">{t('scan.body')}</Text>

      {!hasServer ? <Notice tone="warning" icon="cloud-offline-outline" title={t('scan.noServer')} /> : null}

      {hasServer && canUseCamera ? (
        <View
          style={{ height: 320, borderRadius: theme.radii.xl, overflow: 'hidden', backgroundColor: theme.colors.surfaceInverse }}
          accessible
          accessibilityLabel={t('scan.cameraLabel')}
        >
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return;
              handled.current = true;
              void resolve(data);
            }}
          />
        </View>
      ) : hasServer && Platform.OS !== 'web' && permission && !permission.granted ? (
        <View style={{ gap: theme.space[3] }}>
          <Text tone="secondary">{t('scan.permissionBody')}</Text>
          <SecondaryButton label={t('scan.allowCamera')} icon="camera-outline" onPress={() => void requestPermission()} />
        </View>
      ) : null}

      {busy ? <Muted>{t('scan.checking')}</Muted> : null}
      {error ? <ErrorState title={t('scan.failedTitle')} body={error} retryLabel={t('msg.retry')} onRetry={() => setError(null)} testID="asha-scan-error" /> : null}

      {hasServer ? (
        <View style={{ gap: theme.space[3] }}>
          <TextField label={t('scan.pasteLabel')} placeholder="AM1…" value={payload} onChangeText={setPayload} autoCapitalize="none" autoCorrect={false} testID="asha-scan-payload" />
          <Button title={t('scan.open')} icon="open-outline" loading={busy} disabled={!payload.trim()} onPress={() => void resolve(payload)} testID="asha-scan-submit" />
          {Platform.OS === 'web' || config.demo ? (
            <Button title={t('scan.demo')} icon="flask-outline" variant="secondary" onPress={() => void resolve(DEMO_PAYLOAD)} testID="asha-scan-demo" />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

/** Label over value, so long words wrap at 150% text instead of squeezing a two-column row. */
function Fact({ label, value, testID }: { label: string; value: string | null | undefined; testID?: string }) {
  const { t } = useAsha();
  const theme = useTheme();
  const missing = value == null || value === '';
  return (
    <View accessible accessibilityLabel={`${label}: ${missing ? t('scan.notRecorded') : value}`} style={{ gap: 2 }} testID={testID}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text variant="bodyStrong" color={missing ? theme.colors.textTertiary : undefined}>
        {missing ? t('scan.notRecorded') : value}
      </Text>
    </View>
  );
}

function vitalsFacts(v: NonNullable<ScanSummary['latestVitals']>, t: T): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (v.systolic != null || v.diastolic != null) out.push({ label: t('scan.bp'), value: `${v.systolic ?? '–'}/${v.diastolic ?? '–'} mmHg` });
  if (v.hemoglobin != null) out.push({ label: t('v.hemoglobin'), value: String(v.hemoglobin) });
  if (v.temperatureC != null) out.push({ label: t('v.temperatureC'), value: String(v.temperatureC) });
  if (v.spo2 != null) out.push({ label: t('v.spo2'), value: String(v.spo2) });
  if (v.bloodSugarMgDl != null) out.push({ label: t('scan.sugar'), value: String(v.bloodSugarMgDl) });
  if (v.weightKg != null) out.push({ label: t('v.weightKg'), value: String(v.weightKg) });
  return out;
}

const labelOr = (t: T, key: string, fallback: string) => {
  const s = t(key);
  return s === key ? fallback : s;
};

function ScanResultView({ result }: { result: ScanResult }) {
  const { t, db, store, syncNow } = useAsha();
  const theme = useTheme();
  const { summary, assignment, canAdd, patientId } = result;
  const p = summary.patient;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  /** Opens her copy of the patient; syncs first when the phone does not have it yet. */
  const openPatient = async () => {
    setNote(null);
    let local = findPatient(db.patients, patientId);
    if (!local) {
      setBusy(true);
      await syncNow();
      setBusy(false);
      local = findPatient(store.snapshot.patients, patientId);
    }
    if (local) router.push(`/asha/patient/${local.id}`);
    else setNote(t('scan.notOnPhone'));
  };

  const add = async () => {
    setBusy(true);
    setNote(null);
    const r = await addScannedPatient(patientId);
    if (!r.ok) {
      setBusy(false);
      const msg = r.reason === 'assigned_to_other' || r.reason === 'scan_first' ? t(`scan.addErr.${r.reason}`) : r.reason === 'offline' ? t('scan.err.offline') : t('scan.err.generic');
      setNote(msg);
      feedback.warn(msg);
      return;
    }
    setAdded(true);
    feedback.success(t('scan.added'));
    await syncNow();
    setBusy(false);
    const local = findPatient(store.snapshot.patients, patientId);
    if (local) router.replace(`/asha/patient/${local.id}`);
    else setNote(t('scan.notOnPhone'));
  };

  const sex = p.sex ? t(`scan.sex.${p.sex}`) : null;
  const vitals = summary.latestVitals ? vitalsFacts(summary.latestVitals, t) : [];
  const vSource = summary.latestVitals ? labelOr(t, `vsrc.${summary.latestVitals.source}`, summary.latestVitals.source) : '';

  return (
    <View style={{ gap: theme.space[4] }} testID="asha-scan-result">
      {/* Who it is */}
      <Card>
        <Text variant="h3" accessibilityRole="header">
          {p.fullName}
        </Text>
        {p.pregnancyWeeks != null ? <Pill label={t('scan.pregnant', { n: p.pregnancyWeeks })} tone="accent" icon="heart-outline" /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[4] }}>
          <View style={{ flexGrow: 1, flexBasis: 120 }}>
            <Fact label={t('scan.age')} value={p.ageYears != null ? t('scan.ageYears', { n: p.ageYears }) : null} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 120 }}>
            <Fact label={t('scan.sex')} value={sex} />
          </View>
        </View>
        <Fact label={t('scan.village')} value={p.area} />
        <Fact label={t('scan.phone')} value={p.phone} />
        {p.bloodGroup ? <Fact label={t('scan.bloodGroup')} value={p.bloodGroup} /> : null}
        {p.phone ? (
          <Button title={t('thread.callPatient', { phone: p.phone })} icon="call-outline" variant="secondary" onPress={() => void Linking.openURL(`tel:${p.phone}`).catch(() => undefined)} />
        ) : null}
      </Card>

      {/* Allergies: prominent */}
      {p.allergies.length ? (
        <Notice tone="danger" icon="alert-circle" title={t('scan.allergies')} body={p.allergies.join(', ')} testID="scan-allergies" />
      ) : (
        <Card tone="muted" radius="lg" padding="md">
          <Fact label={t('scan.allergies')} value={null} testID="scan-allergies" />
        </Card>
      )}

      {/* Whose patient */}
      {assignment === 'mine' ? (
        <Notice tone="success" icon="checkmark-circle" title={t('scan.mine')}>
          <Button title={t('scan.openPatient')} icon="person-outline" loading={busy} onPress={() => void openPatient()} testID="asha-scan-open" />
        </Notice>
      ) : assignment === 'none' && canAdd && !added ? (
        <Notice tone="info" icon="person-add-outline" title={t('scan.none')}>
          <Button title={t('scan.add')} icon="person-add" loading={busy} onPress={() => void add()} testID="asha-scan-add" />
        </Notice>
      ) : assignment === 'other' ? (
        <Notice
          tone="warning"
          icon="people-outline"
          title={summary.assignedAsha?.fullName ? t('scan.other', { name: summary.assignedAsha.fullName }) : t('scan.otherUnnamed')}
          testID="asha-scan-other"
        />
      ) : null}
      {added ? <Notice tone="success" icon="checkmark-circle" title={t('scan.added')} /> : null}
      {note ? <Muted>{note}</Muted> : null}

      <Card>
        <H>{t('scan.conditions')}</H>
        {p.conditions.length ? <Text variant="body">{p.conditions.join(', ')}</Text> : <Muted>{t('scan.notRecorded')}</Muted>}
      </Card>

      <Card>
        <H>{t('scan.vitals')}</H>
        {summary.latestVitals && vitals.length ? (
          <>
            <Muted>{t('scan.recordedBy', { date: formatWhen(summary.latestVitals.recordedAt), source: vSource })}</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[4] }}>
              {vitals.map((v) => (
                <View key={v.label} style={{ flexGrow: 1, flexBasis: 120 }}>
                  <Fact label={v.label} value={v.value} />
                </View>
              ))}
            </View>
          </>
        ) : (
          <Muted>{t('scan.notRecorded')}</Muted>
        )}
      </Card>

      <Card>
        <H>{t('scan.symptoms')}</H>
        {summary.symptoms.length ? (
          summary.symptoms.map((s, i) => (
            <View key={`${s.at}-${i}`} accessible style={{ gap: 2, borderTopWidth: i ? 1 : 0, borderTopColor: theme.colors.divider, paddingTop: i ? theme.space[3] : 0 }}>
              <Text variant="caption" tone="secondary">
                {formatDate(s.at)} · {labelOr(t, `ssrc.${s.source}`, s.source)}
              </Text>
              {s.codes.length ? <Text variant="bodyStrong">{s.codes.map((c) => symptomLabel(c, t)).join(', ')}</Text> : null}
              {s.text ? <Text variant="bodySmall">{s.text}</Text> : null}
            </View>
          ))
        ) : (
          <Muted>{t('scan.noSymptoms')}</Muted>
        )}
      </Card>

      <Card>
        <H>{t('scan.openAlerts')}</H>
        {summary.openAlerts.length ? (
          summary.openAlerts.map((a, i) => (
            <View key={`${a.createdAt}-${i}`} accessible style={{ gap: theme.space[1] }}>
              <RiskBadge level={a.level === 'high' ? 'high' : a.level === 'medium' ? 'medium' : 'low'} label={t(`risk.${a.level === 'high' || a.level === 'medium' ? a.level : 'low'}`)} />
              <Text variant="bodySmall">{a.reason}</Text>
              <Text variant="caption" tone="tertiary">
                {formatDate(a.createdAt)}
              </Text>
            </View>
          ))
        ) : (
          <Muted>{t('scan.noAlerts')}</Muted>
        )}
      </Card>

      <Card>
        <H>{t('scan.medicines')}</H>
        {summary.medicines.length ? (
          summary.medicines.map((m, i) => (
            <View key={`${m.name}-${i}`} accessible style={{ gap: 2 }}>
              <Text variant="bodyStrong">{m.name}</Text>
              {[m.dosage, m.frequency].filter(Boolean).length ? <Muted>{[m.dosage, m.frequency].filter(Boolean).join(' · ')}</Muted> : null}
            </View>
          ))
        ) : (
          <Muted>{t('scan.notRecorded')}</Muted>
        )}
      </Card>

      <Card>
        <H>{t('scan.lastDoctor')}</H>
        {summary.lastConsultation ? (
          <View accessible style={{ gap: 2 }}>
            <Text variant="bodyStrong">
              {formatDate(summary.lastConsultation.at)}
              {summary.lastConsultation.doctorName ? ` · ${t('scan.by', { name: summary.lastConsultation.doctorName })}` : ''}
            </Text>
            {summary.lastConsultation.diagnosis ? <Text variant="bodySmall">{t('scan.diagnosis', { text: summary.lastConsultation.diagnosis })}</Text> : null}
            {summary.lastConsultation.followUpDate ? <Muted>{t('scan.followUp', { date: formatDate(summary.lastConsultation.followUpDate) })}</Muted> : null}
          </View>
        ) : (
          <Muted>{t('scan.notRecorded')}</Muted>
        )}
      </Card>

      <Card>
        <H>{t('scan.lastAsha')}</H>
        {summary.lastAshaVisit ? (
          <View accessible style={{ gap: 2 }}>
            <Text variant="bodyStrong">
              {formatDate(summary.lastAshaVisit.at)}
              {summary.lastAshaVisit.ashaName ? ` · ${t('scan.by', { name: summary.lastAshaVisit.ashaName })}` : ''}
            </Text>
            {summary.lastAshaVisit.notes ? <Text variant="bodySmall">{summary.lastAshaVisit.notes}</Text> : null}
          </View>
        ) : (
          <Muted>{t('scan.notRecorded')}</Muted>
        )}
      </Card>
    </View>
  );
}
