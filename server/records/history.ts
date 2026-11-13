/**
 * Builds the patient history view (shared by the patient and doctor screens)
 * from a record bundle. Pure function: no I/O, `now` passed in.
 *
 * Built only on the shared types, so anything P2 (prescriptions, dose logs)
 * or P3 (ASHA visits, risk alerts, referrals) writes shows up here unchanged.
 */
import { REPORT_CATEGORIES } from '../../packages/records/records/types.ts';
import type { BloodGroup, Patient, RiskAlert, VitalsReading } from '../../packages/records/records/types.ts';
import type { PatientRecordBundle } from './repository.ts';

export type StatKey = 'blood_group' | 'weight' | 'heart_rate' | 'blood_pressure' | 'spo2';
export type StatStatus = 'normal' | 'attention' | 'unknown';
export type Trend = 'up' | 'down' | 'flat';

export interface StatCard {
  key: StatKey;
  label: string;
  value: string;
  unit: string | null;
  recordedAt: string | null;
  trend: Trend | null;
  status: StatStatus;
}

export type TimelineKind = 'asha_visit' | 'consultation' | 'prescription' | 'report' | 'referral' | 'risk_alert';

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  subtitle: string | null;
  actorId: string | null;
  actorName: string | null;
  highRisk: boolean;
  /** Id of the underlying record, for opening its detail screen. */
  refId: string;
}

export type VitalsMetric = 'heartRate' | 'systolic' | 'diastolic' | 'weightKg' | 'spo2' | 'bloodSugarMgDl';

export interface VitalsSeries {
  metric: VitalsMetric;
  label: string;
  unit: string;
  points: { at: string; value: number }[];
}

export interface MedicineAdherence {
  medicineName: string;
  taken: number;
  missed: number;
  skipped: number;
  /** taken / (taken + missed + skipped), 0..1, or null if nothing was due. */
  rate: number | null;
}

export interface Adherence {
  windowDays: number;
  taken: number;
  missed: number;
  skipped: number;
  rate: number | null;
  /** Worst first, so the medicine that needs attention is at the top. */
  perMedicine: MedicineAdherence[];
  /** Last 7 local days, oldest first. */
  daily: { date: string; taken: number; due: number }[];
}

export interface PatientHistory {
  patient: {
    id: string;
    fullName: string;
    age: number | null;
    sex: Patient['sex'];
    bloodGroup: BloodGroup | null;
    area: string | null;
  };
  /** Shown highlighted at the top of the screen. */
  alerts: {
    allergies: string[];
    chronicConditions: string[];
    openRiskAlerts: RiskAlert[];
  };
  statCards: StatCard[];
  timeline: TimelineEntry[];
  vitals: VitalsSeries[];
  adherence: Adherence;
  generatedAt: string;
}

export interface BuildHistoryOptions {
  now: Date;
  adherenceWindowDays?: number;
  /** Offset used to group doses into local days. Default India (+05:30). */
  tzOffsetMinutes?: number;
  /** Max points per vitals chart. */
  maxVitalsPoints?: number;
}

const METRICS: { metric: VitalsMetric; label: string; unit: string }[] = [
  { metric: 'heartRate', label: 'Heart rate', unit: 'bpm' },
  { metric: 'systolic', label: 'Systolic BP', unit: 'mmHg' },
  { metric: 'diastolic', label: 'Diastolic BP', unit: 'mmHg' },
  { metric: 'weightKg', label: 'Weight', unit: 'kg' },
  { metric: 'spo2', label: 'SpO₂', unit: '%' },
  { metric: 'bloodSugarMgDl', label: 'Blood sugar', unit: 'mg/dL' },
];

export function buildPatientHistory(bundle: PatientRecordBundle, opts: BuildHistoryOptions): PatientHistory {
  const { patient } = bundle;
  const names = new Map(bundle.people.map((p) => [p.id, p.fullName]));
  const vitals = [...bundle.vitals].sort((a, b) => cmpTime(a.recordedAt, b.recordedAt));

  return {
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      age: ageOn(patient.dateOfBirth, opts.now),
      sex: patient.sex,
      bloodGroup: patient.bloodGroup,
      area: patient.area,
    },
    alerts: {
      allergies: dedupe(patient.allergies),
      chronicConditions: dedupe(patient.chronicConditions),
      openRiskAlerts: bundle.riskAlerts
        .filter((r) => r.resolvedAt === null)
        .sort((a, b) => levelRank(b.level) - levelRank(a.level) || cmpTime(b.createdAt, a.createdAt)),
    },
    statCards: buildStatCards(patient, vitals),
    timeline: buildTimeline(bundle, names),
    vitals: buildVitalsSeries(vitals, opts.maxVitalsPoints ?? 30),
    adherence: buildAdherence(bundle, opts),
    generatedAt: opts.now.toISOString(),
  };
}

// --- stat cards ------------------------------------------------------------

function buildStatCards(patient: Patient, vitals: VitalsReading[]): StatCard[] {
  const weight = lastTwo(vitals, 'weightKg');
  const hr = lastTwo(vitals, 'heartRate');
  const spo2 = lastTwo(vitals, 'spo2');
  const bp = [...vitals].reverse().find((v) => isNum(v.systolic) && isNum(v.diastolic)) ?? null;

  return [
    {
      key: 'blood_group',
      label: 'Blood Group',
      value: patient.bloodGroup ?? '—',
      unit: null,
      recordedAt: null,
      trend: null,
      status: patient.bloodGroup ? 'normal' : 'unknown',
    },
    numericCard('weight', 'Weight', 'kg', weight, () => 'normal'),
    numericCard('heart_rate', 'Heart Rate', 'bpm', hr, (v) => (v >= 60 && v <= 100 ? 'normal' : 'attention')),
    {
      key: 'blood_pressure',
      label: 'Blood Pressure',
      value: bp ? `${bp.systolic}/${bp.diastolic}` : '—',
      unit: bp ? 'mmHg' : null,
      recordedAt: bp?.recordedAt ?? null,
      trend: null,
      status: !bp
        ? 'unknown'
        : (bp.systolic as number) >= 140 || (bp.diastolic as number) >= 90 || (bp.systolic as number) < 90
          ? 'attention'
          : 'normal',
    },
    numericCard('spo2', 'SpO₂', '%', spo2, (v) => (v >= 95 ? 'normal' : 'attention')),
  ];
}

type Reading = { value: number; at: string };

function lastTwo(vitals: VitalsReading[], metric: VitalsMetric): [Reading | null, Reading | null] {
  const found: Reading[] = [];
  for (let i = vitals.length - 1; i >= 0 && found.length < 2; i--) {
    const v = vitals[i]![metric];
    if (isNum(v)) found.push({ value: v, at: vitals[i]!.recordedAt });
  }
  return [found[0] ?? null, found[1] ?? null];
}

function numericCard(
  key: StatKey,
  label: string,
  unit: string,
  [latest, previous]: [Reading | null, Reading | null],
  status: (v: number) => StatStatus,
): StatCard {
  if (!latest) return { key, label, value: '—', unit: null, recordedAt: null, trend: null, status: 'unknown' };
  return {
    key,
    label,
    value: formatNumber(latest.value),
    unit,
    recordedAt: latest.at,
    trend: previous ? trendOf(latest.value, previous.value) : null,
    status: status(latest.value),
  };
}

function trendOf(latest: number, previous: number): Trend {
  const delta = latest - previous;
  if (Math.abs(delta) <= Math.abs(previous) * 0.01) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

// --- timeline --------------------------------------------------------------

function buildTimeline(bundle: PatientRecordBundle, names: Map<string, string>): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const categoryLabel = new Map(REPORT_CATEGORIES.map((c) => [c.key, c.label]));

  for (const v of bundle.ashaVisits) {
    entries.push({
      id: `asha_visit:${v.id}`,
      kind: 'asha_visit',
      at: v.visitedAt,
      title: 'ASHA home visit',
      subtitle: v.notes,
      actorId: v.ashaWorkerId,
      actorName: name(v.ashaWorkerId),
      highRisk: v.riskLevel === 'high',
      refId: v.id,
    });
  }
  for (const c of bundle.consultations) {
    entries.push({
      id: `consultation:${c.id}`,
      kind: 'consultation',
      at: c.startedAt,
      title: 'Consultation',
      subtitle: c.diagnosis ?? c.notes,
      actorId: c.doctorId,
      actorName: name(c.doctorId),
      highRisk: false,
      refId: c.id,
    });
  }
  for (const p of bundle.prescriptions) {
    const meds = p.items.map((i) => i.name).join(', ');
    entries.push({
      id: `prescription:${p.id}`,
      kind: 'prescription',
      at: p.issuedAt,
      title: p.source === 'scan' ? 'Scanned prescription' : 'Prescription',
      subtitle: meds || p.diagnosis,
      actorId: p.prescribedBy,
      actorName: name(p.prescribedBy),
      highRisk: false,
      refId: p.id,
    });
  }
  for (const r of bundle.reports) {
    entries.push({
      id: `report:${r.id}`,
      kind: 'report',
      at: r.reportDate ? `${r.reportDate}T00:00:00.000Z` : r.createdAt,
      title: `${categoryLabel.get(r.category) ?? 'Report'} report`,
      subtitle: r.title,
      actorId: r.uploadedBy,
      actorName: name(r.uploadedBy),
      highRisk: false,
      refId: r.id,
    });
  }
  for (const r of bundle.referrals) {
    entries.push({
      id: `referral:${r.id}`,
      kind: 'referral',
      at: r.createdAt,
      title: 'Referred by ASHA worker',
      subtitle: r.reason,
      actorId: r.fromAshaId,
      actorName: name(r.fromAshaId),
      highRisk: r.riskAlertId !== null,
      refId: r.id,
    });
  }
  for (const a of bundle.riskAlerts) {
    entries.push({
      id: `risk_alert:${a.id}`,
      kind: 'risk_alert',
      at: a.createdAt,
      title: a.level === 'high' ? 'High-risk alert' : 'Risk alert',
      subtitle: a.reason,
      actorId: a.ashaWorkerId,
      actorName: name(a.ashaWorkerId),
      highRisk: a.level === 'high',
      refId: a.id,
    });
  }

  return entries.sort((a, b) => cmpTime(b.at, a.at) || a.id.localeCompare(b.id));
}

// --- vitals ----------------------------------------------------------------

function buildVitalsSeries(vitals: VitalsReading[], maxPoints: number): VitalsSeries[] {
  const series: VitalsSeries[] = [];
  for (const m of METRICS) {
    const points = vitals
      .filter((v) => isNum(v[m.metric]))
      .map((v) => ({ at: v.recordedAt, value: v[m.metric] as number }));
    if (points.length > 0) series.push({ ...m, points: points.slice(-maxPoints) });
  }
  return series;
}

// --- adherence -------------------------------------------------------------

function buildAdherence(bundle: PatientRecordBundle, opts: BuildHistoryOptions): Adherence {
  const windowDays = opts.adherenceWindowDays ?? 30;
  const tz = opts.tzOffsetMinutes ?? 330;
  const nowMs = opts.now.getTime();
  const fromMs = nowMs - windowDays * 86_400_000;

  const due = bundle.doseLogs.filter((d) => {
    const t = Date.parse(d.scheduledAt);
    return d.status !== 'pending' && t <= nowMs && t > fromMs;
  });

  const perMed = new Map<string, MedicineAdherence>();
  let taken = 0;
  let missed = 0;
  let skipped = 0;
  for (const d of due) {
    const m = perMed.get(d.medicineName) ?? { medicineName: d.medicineName, taken: 0, missed: 0, skipped: 0, rate: null };
    if (d.status === 'taken') (m.taken++, taken++);
    else if (d.status === 'missed') (m.missed++, missed++);
    else (m.skipped++, skipped++);
    perMed.set(d.medicineName, m);
  }
  for (const m of perMed.values()) m.rate = ratio(m.taken, m.taken + m.missed + m.skipped);

  const today = localDate(nowMs, tz);
  const daily: Adherence['daily'] = [];
  for (let i = 6; i >= 0; i--) {
    const date = localDate(Date.parse(`${today}T12:00:00Z`) - i * 86_400_000, 0);
    const day = due.filter((d) => localDate(Date.parse(d.scheduledAt), tz) === date);
    daily.push({ date, taken: day.filter((d) => d.status === 'taken').length, due: day.length });
  }

  return {
    windowDays,
    taken,
    missed,
    skipped,
    rate: ratio(taken, taken + missed + skipped),
    perMedicine: [...perMed.values()].sort(
      (a, b) => (a.rate ?? 1) - (b.rate ?? 1) || a.medicineName.localeCompare(b.medicineName),
    ),
    daily,
  };
}

// --- helpers ---------------------------------------------------------------

export function ageOn(dateOfBirth: string | null, now: Date): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 0 ? age : null;
}

function localDate(ms: number, tzOffsetMinutes: number): string {
  return new Date(ms + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function ratio(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

function cmpTime(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function formatNumber(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function levelRank(level: RiskAlert['level']): number {
  return level === 'high' ? 2 : 1;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (item && !seen.has(key)) (seen.add(key), out.push(item));
  }
  return out;
}
