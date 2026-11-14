/**
 * Who may see and write a patient's preventive records. Mirrors
 * p5_can_read_prevention / p5_can_record_prevention in
 * supabase/migrations/5101_preventive.sql; keep the two in step.
 *
 *  read:  everything server/records/access.ts allows (patient own; doctor
 *         facility, referral, QR grant; admin facility), plus the ASHA for
 *         patients assigned to her.
 *  write: the ASHA for her patients, a doctor for patients they may view;
 *         a patient only self-reports a past vaccine on their own record.
 */
import type { Patient, Profile } from '../../packages/shared/types.ts';
import { toDbId } from '../../packages/shared/ids.ts';
import { resolveAccess, type AccessBasis } from '../records/access.ts';
import type { RecordsRepository } from '../records/repository.ts';
import type { PreventionRepository, PreventionSubject } from './repository.ts';

export type PreventionBasis = AccessBasis | 'asha_assigned';
export type PreventionDecision =
  | { allowed: true; basis: PreventionBasis; patient: Patient | null; subject: PreventionSubject | null }
  | { allowed: false; reason: 'inactive_account' | 'no_patient' | 'not_permitted' };

export async function findPatient(records: RecordsRepository, patientId: string): Promise<Patient | null> {
  return (await records.getPatient(patientId)) ?? (toDbId(patientId) !== patientId ? await records.getPatient(toDbId(patientId)) : null);
}

export async function preventionAccess(records: RecordsRepository, repo: PreventionRepository, viewer: Profile, patientId: string, now: Date): Promise<PreventionDecision> {
  if (!viewer.isActive) return { allowed: false, reason: 'inactive_account' };
  const [patient, subject] = await Promise.all([findPatient(records, patientId), repo.getSubject(patientId)]);
  if (!patient && !subject) return { allowed: false, reason: 'no_patient' };

  if (viewer.role === 'asha') {
    const assigned = (patient?.ashaWorkerId ?? subject?.ashaWorkerId ?? null) === viewer.id;
    return assigned ? { allowed: true, basis: 'asha_assigned', patient, subject } : { allowed: false, reason: 'not_permitted' };
  }
  if (!patient) return { allowed: false, reason: 'not_permitted' };
  const d = await resolveAccess(records, viewer, patient.id, now);
  return d.allowed ? { allowed: true, basis: d.basis, patient, subject } : { allowed: false, reason: d.reason };
}

/** May this viewer write this kind of record (given they may read the patient)? */
export function mayWrite(viewer: Profile, basis: PreventionBasis, kind: string): boolean {
  if (viewer.role === 'asha') return basis === 'asha_assigned';
  if (viewer.role === 'doctor') return true;
  if (viewer.role === 'patient') return basis === 'self' && kind === 'vaccination';
  return false;
}
