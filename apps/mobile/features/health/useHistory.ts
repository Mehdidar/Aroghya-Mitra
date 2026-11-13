/**
 * The patient history view, built on the phone from the local records store
 * with the same builder the server uses (server/records/history.ts), so the
 * Health tab, the History screen and a doctor's scan all read one shape.
 */
import { useMemo } from 'react';

import { DEMO_PROFILES, type AshaVisit } from '@am/shared';
import { buildPatientHistory, type PatientHistory } from '@server/records/history';
import type { PatientRecordBundle } from '@server/records/repository';

import { currentPatientId } from '@/features/shared/state/session';
import { useRecords, type RecordsState } from '@/features/shared/data/recordsStore';

/** Bundle for one patient from the local store. ASHA visits are derived from ASHA-sourced vitals. */
export function bundleFor(s: RecordsState, patientId: string): PatientRecordBundle | null {
  const patient = s.patients[patientId];
  if (!patient) return null;
  const mine = <T extends { patientId: string }>(rows: T[]) => rows.filter((r) => r.patientId === patientId);
  const ashaVisits: AshaVisit[] = mine(s.vitals)
    .filter((v) => v.source === 'asha_visit')
    .map((v) => ({
      id: `visit-${v.id}`,
      patientId,
      ashaWorkerId: v.recordedBy ?? patient.ashaWorkerId ?? 'asha',
      visitedAt: v.recordedAt,
      notes: null,
      riskLevel: (v.systolic ?? 0) >= 140 || (v.diastolic ?? 0) >= 90 ? 'high' : null,
    }));
  return {
    patient,
    vitals: mine(s.vitals),
    ashaVisits,
    prescriptions: mine(s.prescriptions),
    doseLogs: mine(s.doseLogs),
    reports: mine(s.reports),
    consultations: mine(s.consultations),
    referrals: mine(s.referrals),
    riskAlerts: mine(s.riskAlerts),
    people: DEMO_PROFILES.map((p) => ({ id: p.id, fullName: p.fullName, role: p.role })),
  };
}

export function historyFor(s: RecordsState, patientId: string, now = new Date()): PatientHistory | null {
  const bundle = bundleFor(s, patientId);
  return bundle ? buildPatientHistory(bundle, { now }) : null;
}

/** The signed-in demo patient's history (null until the store is seeded). */
export function usePatientHistory(patientId: string = currentPatientId()): PatientHistory | null {
  const seededAt = useRecords((s) => s.seededAt);
  const vitals = useRecords((s) => s.vitals);
  const prescriptions = useRecords((s) => s.prescriptions);
  const doseLogs = useRecords((s) => s.doseLogs);
  const reports = useRecords((s) => s.reports);
  const consultations = useRecords((s) => s.consultations);
  const referrals = useRecords((s) => s.referrals);
  const riskAlerts = useRecords((s) => s.riskAlerts);
  const patients = useRecords((s) => s.patients);
  return useMemo(
    () => (seededAt ? historyFor(useRecords.getState(), patientId) : null),
    // every slice above is a dependency so the view rebuilds when any record changes
    [seededAt, patientId, vitals, prescriptions, doseLogs, reports, consultations, referrals, riskAlerts, patients],
  );
}
