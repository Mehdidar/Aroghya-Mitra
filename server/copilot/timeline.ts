/**
 * Clinical timeline for the doctor (copilot, feature B): every dated event in
 * the record, newest first. Reuses the History timeline (ASHA visits,
 * consultations, prescriptions, reports, referrals, risk alerts) and adds
 * vitals readings and lab values. Pure; the app filters by kind.
 */
import type { PatientHistory, TimelineEntry, TimelineKind } from '../records/history.ts';
import type { LabResult, PatientRecordBundle } from '../records/repository.ts';
import { displayLabValue, flagOf, labTest } from './labs.ts';

export type ClinicalTimelineKind = TimelineKind | 'vitals' | 'lab';
export const CLINICAL_TIMELINE_KINDS: ClinicalTimelineKind[] = ['consultation', 'prescription', 'vitals', 'lab', 'report', 'asha_visit', 'risk_alert', 'referral'];

export type ClinicalTimelineEntry = Omit<TimelineEntry, 'kind'> & { kind: ClinicalTimelineKind };

export function buildClinicalTimeline(bundle: PatientRecordBundle, labs: LabResult[], history: Pick<PatientHistory, 'timeline'>): ClinicalTimelineEntry[] {
  const names = new Map(bundle.people.map((p) => [p.id, p.fullName]));
  const entries: ClinicalTimelineEntry[] = [...history.timeline];

  for (const v of bundle.vitals) {
    const parts: string[] = [];
    if (v.systolic != null && v.diastolic != null) parts.push(`BP ${v.systolic}/${v.diastolic}`);
    if (v.heartRate != null) parts.push(`HR ${v.heartRate}`);
    if (v.spo2 != null) parts.push(`SpO₂ ${v.spo2}%`);
    if (v.weightKg != null) parts.push(`${v.weightKg} kg`);
    if (v.bloodSugarMgDl != null) parts.push(`Sugar ${v.bloodSugarMgDl} mg/dL`);
    if (!parts.length) continue;
    entries.push({
      id: `vitals:${v.id}`,
      kind: 'vitals',
      at: v.recordedAt,
      title: 'Vitals',
      subtitle: parts.join(' · '),
      actorId: v.recordedBy,
      actorName: v.recordedBy ? (names.get(v.recordedBy) ?? null) : null,
      highRisk: (v.systolic ?? 0) >= 140 || (v.diastolic ?? 0) >= 90 || (v.spo2 != null && v.spo2 < 94),
      refId: v.id,
    });
  }

  // One entry per lab day (a report usually carries several values).
  const byDay = new Map<string, LabResult[]>();
  for (const l of labs) {
    const key = `${l.observedAt.slice(0, 10)}|${l.reportId ?? ''}`;
    byDay.set(key, [...(byDay.get(key) ?? []), l]);
  }
  for (const [key, rows] of byDay) {
    const anyOut = rows.some((r) => ['low', 'high'].includes(flagOf(r.value, r.referenceLow, r.referenceHigh)));
    entries.push({
      id: `lab:${key}`,
      kind: 'lab',
      at: rows[0].observedAt,
      title: 'Lab results',
      subtitle: rows
        .map((r) => {
          const f = flagOf(r.value, r.referenceLow, r.referenceHigh);
          const unit = labTest(r.testCode)?.grades ? '' : ` ${r.unit}`;
          return `${r.testName} ${displayLabValue(r.testCode, r.value)}${unit}${f === 'low' || f === 'high' ? ` (${f})` : ''}`;
        })
        .join(' · '),
      actorId: rows[0].enteredBy,
      actorName: names.get(rows[0].enteredBy) ?? null,
      highRisk: anyOut,
      refId: rows[0].reportId ?? rows[0].id,
    });
  }

  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}

export function filterTimeline(entries: ClinicalTimelineEntry[], kinds: Iterable<ClinicalTimelineKind> | null, opts: { highRiskOnly?: boolean } = {}): ClinicalTimelineEntry[] {
  const set = kinds ? new Set(kinds) : null;
  return entries.filter((e) => (!set || set.size === 0 || set.has(e.kind)) && (!opts.highRiskOnly || e.highRisk));
}
