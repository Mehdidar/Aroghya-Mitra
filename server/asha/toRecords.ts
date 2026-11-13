/**
 * ASHA sync records → the shared health-record shapes, so what an ASHA worker
 * syncs reaches the doctor's inbox and the patient's history (not only the
 * ASHA file store). Used by both records repositories.
 */
import { DEMO_FACILITY } from '../../packages/shared/demo.ts';
import type { AshaPatient, AshaVisit, Patient, RecordReferral, RecordRiskAlert, Referral, RiskAlert, Visit } from '../../packages/shared/types.ts';

/** Same shape as sync.ts's VerifiedAlert (kept here so this file has no Node imports: the app type-imports repository.ts). */
export type VerifiedAlert = RiskAlert & { verifiedBy: 'phone' | 'server' };

export interface AshaBatch {
  patients: AshaPatient[];
  visits: Visit[];
  /** The server-verified alerts, plus phone alerts for visits the server did not re-check. */
  alerts: VerifiedAlert[];
  referrals: Referral[];
}

const STATUS_ORDER = ['pending', 'seen', 'accepted', 'closed'] as const;
/** A referral never moves backwards: an ASHA phone re-sending 'pending' does not undo the doctor's 'accepted'. */
export const furtherStatus = (a: Referral['status'], b: Referral['status']) => (STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b);

export const ashaPatientToRecord = (p: AshaPatient, facilityId: string | null = DEMO_FACILITY.id): Patient => ({
  id: p.id,
  userId: null,
  fullName: p.name,
  dateOfBirth: p.dob ? p.dob.slice(0, 10) : null,
  sex: p.sex === 'F' ? 'female' : p.sex === 'M' ? 'male' : null,
  phone: p.phone ?? null,
  facilityId,
  ashaWorkerId: p.assignedAshaId,
  area: p.village ?? null,
  bloodGroup: null,
  allergies: [],
  chronicConditions: p.conditions ?? [],
  createdAt: new Date().toISOString(),
});

export const visitToRecord = (v: Visit, alerts: VerifiedAlert[]): AshaVisit => {
  const sev = alerts.filter((a) => a.visitId === v.id).map((a) => a.severity);
  const worst = (['critical', 'high', 'medium', 'low'] as const).find((s) => sev.includes(s));
  return {
    id: v.id,
    patientId: v.patientId,
    ashaWorkerId: v.ashaId,
    visitedAt: v.visitedAt,
    notes: v.notes ?? null,
    riskLevel: worst === 'critical' ? 'high' : (worst ?? null),
  };
};

export const alertToRecord = (a: VerifiedAlert, ashaId: string): RecordRiskAlert => ({
  id: a.id,
  patientId: a.patientId,
  ashaWorkerId: ashaId,
  level: a.severity === 'critical' || a.severity === 'high' ? 'high' : 'medium',
  reason: a.reason,
  createdAt: a.createdAt,
  resolvedAt: a.acknowledged ? a.createdAt : null,
});

export const referralToRecord = (r: Referral, facilityId: string | null = DEMO_FACILITY.id): RecordReferral => ({
  id: r.id,
  patientId: r.patientId,
  fromAshaId: r.fromAshaId,
  toDoctorId: r.toDoctorId ?? null,
  toFacilityId: facilityId,
  reason: r.reason,
  riskAlertId: r.alertIds[0] ?? null,
  status: r.status,
  createdAt: r.createdAt,
  seenAt: r.status === 'pending' ? null : r.updatedAt,
  acceptedAt: r.status === 'accepted' || r.status === 'closed' ? r.updatedAt : null,
});
