/**
 * Patient summary for the doctor (copilot, feature A). DETERMINISTIC: built
 * only from the record bundle (and lab values), with the same history builder
 * the History screen uses (server/records/history.ts). No model is involved
 * here; the optional AI narrative (narrative.ts) is written FROM `facts` and
 * checked against them.
 *
 * Pure (no I/O, `now` passed in), so the app builds the same summary offline
 * from its local store.
 */
import type { AshaVisit, Consultation, Patient, Prescription, VitalsReading } from '../../packages/records/records/types.ts';
import { pregnancyFromRecord } from '../../packages/records/medicines/safety.ts';
import { buildPatientHistory, type PatientHistory, type StatCard } from '../records/history.ts';
import type { LabResult, PatientRecordBundle } from '../records/repository.ts';
import { compareLabs, labLine, type LabComparison } from './labs.ts';
import { buildClinicalTimeline, type ClinicalTimelineEntry } from './timeline.ts';

const DAY = 86_400_000;

export interface CurrentMedicine {
  name: string;
  dosage: string;
  frequency: string;
  instructions: string | null;
  prescriptionId: string;
  issuedAt: string;
  source: Prescription['source'];
  prescriberName: string | null;
  /** Last day of the course, or null when no duration was written. */
  until: string | null;
}

export interface CopilotSummary {
  patient: PatientHistory['patient'];
  conditions: string[];
  allergies: string[];
  /** Diagnoses written in past consultations and prescriptions (medical history), newest first. */
  pastDiagnoses: { text: string; at: string }[];
  pregnancy: { pregnant: boolean; weeks: number | null; basis: string | null };
  currentMedicines: CurrentMedicine[];
  adherence: { windowDays: number; rate: number | null; missed: number; worst: { medicineName: string; rate: number | null; missed: number }[] };
  vitals: { cards: StatCard[]; recent: VitalsReading[] };
  /** null: lab values could not be loaded (not the same as "none"). */
  labs: LabComparison | null;
  reports: { id: string; title: string; category: string; date: string }[];
  consultations: { id: string; at: string; diagnosis: string | null; notes: string | null; labOrders: string[]; followUpDate: string | null; doctorName: string | null }[];
  asha: {
    visits: { id: string; at: string; notes: string | null; riskLevel: AshaVisit['riskLevel']; ashaName: string | null }[];
    openAlerts: { id: string; level: 'medium' | 'high'; reason: string; at: string }[];
  };
  openReferrals: { id: string; reason: string; status: string; createdAt: string; fromName: string | null; waitingHours: number }[];
  /** The latest consultation's follow-up date, if it is today or later. */
  nextFollowUp: string | null;
  /** One English line per fact: what the AI narrative may use, and nothing else. */
  facts: string[];
  timeline: ClinicalTimelineEntry[];
  generatedAt: string;
}

const day = (iso: string) => iso.slice(0, 10);
const newestFirst = <T>(rows: T[], at: (r: T) => string) => [...rows].sort((a, b) => Date.parse(at(b)) - Date.parse(at(a)));

export function activeMedicines(prescriptions: Prescription[], now: Date, names: Map<string, string>): CurrentMedicine[] {
  const out: CurrentMedicine[] = [];
  for (const p of newestFirst(prescriptions, (r) => r.issuedAt)) {
    const issued = Date.parse(p.issuedAt);
    for (const it of p.items) {
      const end = it.durationDays ? issued + it.durationDays * DAY : null;
      // No duration written: count it as current for 90 days, then it needs confirming at the next visit.
      const active = end !== null ? end >= now.getTime() : now.getTime() - issued <= 90 * DAY;
      if (!active || out.some((m) => m.name.toLowerCase() === it.name.toLowerCase())) continue;
      out.push({
        name: it.name,
        dosage: it.dosage,
        frequency: it.frequency,
        instructions: it.instructions ?? null,
        prescriptionId: p.id,
        issuedAt: p.issuedAt,
        source: p.source,
        prescriberName: p.prescribedBy ? (names.get(p.prescribedBy) ?? null) : null,
        until: end !== null ? new Date(end).toISOString().slice(0, 10) : null,
      });
    }
  }
  return out;
}

function vitalsLine(v: VitalsReading): string {
  const parts: string[] = [];
  if (v.systolic != null && v.diastolic != null) parts.push(`BP ${v.systolic}/${v.diastolic} mmHg`);
  if (v.heartRate != null) parts.push(`heart rate ${v.heartRate} bpm`);
  if (v.spo2 != null) parts.push(`SpO2 ${v.spo2}%`);
  if (v.weightKg != null) parts.push(`weight ${v.weightKg} kg`);
  if (v.bloodSugarMgDl != null) parts.push(`blood sugar ${v.bloodSugarMgDl} mg/dL`);
  return parts.join(', ');
}

export function buildCopilotSummary(bundle: PatientRecordBundle, labs: LabResult[] | null, opts: { now: Date }): CopilotSummary {
  const { now } = opts;
  const history = buildPatientHistory(bundle, { now });
  const names = new Map(bundle.people.map((p) => [p.id, p.fullName]));
  const name = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);
  const p: Patient = bundle.patient;

  const consultations = newestFirst(bundle.consultations, (c) => c.startedAt);
  const referralsNewest = newestFirst(bundle.referrals, (r) => r.createdAt);
  const pregnancy = pregnancyFromRecord(p.chronicConditions, [
    ...referralsNewest.map((r) => r.reason),
    ...consultations.flatMap((c: Consultation) => [c.diagnosis ?? '', c.notes ?? '']),
    ...newestFirst(bundle.prescriptions, (r) => r.issuedAt).map((r) => r.diagnosis ?? ''),
  ]);

  const pastDiagnoses: CopilotSummary['pastDiagnoses'] = [];
  for (const d of [
    ...consultations.map((c) => ({ text: c.diagnosis, at: c.startedAt })),
    ...bundle.prescriptions.filter((r) => r.source === 'doctor').map((r) => ({ text: r.diagnosis, at: r.issuedAt })),
  ]) {
    const text = d.text?.trim();
    if (text && !pastDiagnoses.some((x) => x.text.toLowerCase() === text.toLowerCase())) pastDiagnoses.push({ text, at: d.at });
  }
  pastDiagnoses.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const currentMedicines = activeMedicines(bundle.prescriptions, now, names);
  const recentVitals = newestFirst(bundle.vitals, (v) => v.recordedAt).slice(0, 5);
  const labComparison = labs ? compareLabs(labs) : null;
  const visits = newestFirst(bundle.ashaVisits, (v) => v.visitedAt).slice(0, 5);
  const openAlerts = history.alerts.openRiskAlerts.map((a) => ({ id: a.id, level: a.level, reason: a.reason, at: a.createdAt }));
  const openReferrals = referralsNewest
    .filter((r) => r.status !== 'closed')
    .map((r) => ({ id: r.id, reason: r.reason, status: r.status, createdAt: r.createdAt, fromName: name(r.fromAshaId), waitingHours: Math.max(0, Math.floor((now.getTime() - Date.parse(r.createdAt)) / 3_600_000)) }));
  const latestFollowUp = consultations.find((c) => c.followUpDate)?.followUpDate ?? null;
  const nextFollowUp = latestFollowUp && latestFollowUp >= day(now.toISOString()) ? latestFollowUp : null;
  const adherence = history.adherence;

  // ---- facts: plain lines, every number copied from the record ----------------
  const facts: string[] = [];
  const pt = history.patient;
  facts.push(`Patient: ${pt.fullName}${pt.age !== null ? `, ${pt.age} years` : ''}${pt.sex ? `, ${pt.sex}` : ''}${pt.bloodGroup ? `, blood group ${pt.bloodGroup}` : ''}.`);
  facts.push(history.alerts.chronicConditions.length ? `Existing conditions: ${history.alerts.chronicConditions.join(', ')}.` : 'Existing conditions: none recorded.');
  facts.push(history.alerts.allergies.length ? `Allergies: ${history.alerts.allergies.join(', ')}.` : 'Allergies: none recorded.');
  if (pregnancy.pregnant) facts.push(`Pregnant${pregnancy.weeks ? `, ${pregnancy.weeks} weeks` : ', weeks not recorded'} (from the record).`);
  if (pastDiagnoses.length) facts.push(`Past diagnoses: ${pastDiagnoses.map((d) => `${d.text} (${day(d.at)})`).join('; ')}.`);
  facts.push(
    currentMedicines.length
      ? `Current medicines: ${currentMedicines.map((m) => `${m.name}, ${m.dosage}, ${m.frequency}${m.source === 'scan' ? ' (from a scanned paper prescription)' : ''}`).join('; ')}.`
      : 'Current medicines: none active in the record.',
  );
  if (adherence.rate !== null) {
    facts.push(`Doses taken in the last ${adherence.windowDays} days: ${Math.round(adherence.rate * 100)}% (${adherence.missed} missed, ${adherence.skipped} skipped).`);
  }
  if (recentVitals.length) {
    facts.push(`Latest vitals (${day(recentVitals[0].recordedAt)}): ${vitalsLine(recentVitals[0]) || 'no values'}.`);
    const bps = [...recentVitals].reverse().filter((v) => v.systolic != null && v.diastolic != null);
    if (bps.length > 1) facts.push(`Blood pressure over time: ${bps.map((v) => `${v.systolic}/${v.diastolic} (${day(v.recordedAt)})`).join(', ')}.`);
  } else facts.push('Vitals: none recorded.');
  if (labComparison?.series.length) for (const s of labComparison.series) facts.push(`Lab: ${labLine(s)}, latest on ${day(s.latest.observedAt)}.`);
  for (const r of newestFirst(bundle.reports, (x) => x.reportDate ?? x.createdAt).slice(0, 5)) facts.push(`Report on file: ${r.title} (${r.reportDate ?? day(r.createdAt)}).`);
  for (const c of consultations.slice(0, 3)) {
    facts.push(`Consultation ${day(c.startedAt)}${name(c.doctorId) ? ` with ${name(c.doctorId)}` : ''}: ${[c.diagnosis, c.notes].filter(Boolean).join('. ') || 'no notes'}${c.labOrders.length ? `. Labs ordered: ${c.labOrders.join(', ')}` : ''}${c.followUpDate ? `. Follow-up ${c.followUpDate}` : ''}.`);
  }
  for (const v of visits.slice(0, 3)) facts.push(`ASHA visit ${day(v.visitedAt)}${name(v.ashaWorkerId) ? ` by ${name(v.ashaWorkerId)}` : ''}: ${v.notes ?? 'no notes'}${v.riskLevel ? ` (risk ${v.riskLevel})` : ''}.`);
  for (const a of openAlerts) facts.push(`Open ${a.level}-risk alert (${day(a.at)}): ${a.reason}.`);
  for (const r of openReferrals) facts.push(`Open referral (${day(r.createdAt)}, ${r.status})${r.fromName ? ` from ${r.fromName}` : ''}: ${r.reason}`);

  return {
    patient: history.patient,
    conditions: history.alerts.chronicConditions,
    allergies: history.alerts.allergies,
    pastDiagnoses,
    pregnancy,
    currentMedicines,
    adherence: {
      windowDays: adherence.windowDays,
      rate: adherence.rate,
      missed: adherence.missed,
      worst: adherence.perMedicine.slice(0, 3).map((m) => ({ medicineName: m.medicineName, rate: m.rate, missed: m.missed })),
    },
    vitals: { cards: history.statCards, recent: recentVitals },
    labs: labComparison,
    reports: newestFirst(bundle.reports, (x) => x.reportDate ?? x.createdAt).map((r) => ({ id: r.id, title: r.title, category: r.category, date: r.reportDate ?? day(r.createdAt) })),
    consultations: consultations.slice(0, 5).map((c) => ({ id: c.id, at: c.startedAt, diagnosis: c.diagnosis, notes: c.notes, labOrders: c.labOrders, followUpDate: c.followUpDate, doctorName: name(c.doctorId) })),
    asha: { visits: visits.map((v) => ({ id: v.id, at: v.visitedAt, notes: v.notes, riskLevel: v.riskLevel, ashaName: name(v.ashaWorkerId) })), openAlerts },
    openReferrals,
    nextFollowUp,
    facts,
    timeline: buildClinicalTimeline(bundle, labs ?? [], history),
    generatedAt: now.toISOString(),
  };
}
