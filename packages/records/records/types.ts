/**
 * DRAFT shared types used by P4 (Doctor/Admin + Health Records).
 *
 * These mirror what P4 needs from the shared model owned by P1. When P1's
 * shared types land, replace the body of this file with re-exports from P1's
 * module (e.g. `export type * from '../../shared/types.ts'`) and fix any
 * field-name drift. Requested changes are listed in
 * `features/records/P1_SHARED_TYPES_REQUEST.md`.
 *
 * Conventions: ids are UUID strings, timestamps are ISO-8601 strings (UTC),
 * dates without time are `YYYY-MM-DD`. Database columns are snake_case.
 */

export type Role = 'patient' | 'doctor' | 'asha' | 'admin';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export const BLOOD_GROUPS: readonly BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** A signed-in user (doctor, ASHA worker, admin, or patient with an account). */
export interface Profile {
  id: string;
  role: Role;
  fullName: string;
  facilityId: string | null;
  isActive: boolean;
}

/** A registered patient. A patient registered by a doctor may have no account (`userId` null). */
export interface Patient {
  id: string;
  userId: string | null;
  fullName: string;
  dateOfBirth: string | null;
  sex: 'male' | 'female' | 'other' | null;
  phone: string | null;
  facilityId: string | null;
  ashaWorkerId: string | null;
  area: string | null;
  bloodGroup: BloodGroup | null;
  allergies: string[];
  chronicConditions: string[];
  createdAt: string;
}

export type VitalsSource = 'asha_visit' | 'consultation' | 'self' | 'device';

export interface VitalsReading {
  id: string;
  patientId: string;
  recordedAt: string;
  recordedBy: string | null;
  source: VitalsSource;
  heartRate?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  weightKg?: number | null;
  spo2?: number | null;
  temperatureC?: number | null;
  bloodSugarMgDl?: number | null;
}

export type RiskLevel = 'low' | 'medium' | 'high';

/** ASHA home visit (owned by P3). */
export interface AshaVisit {
  id: string;
  patientId: string;
  ashaWorkerId: string;
  visitedAt: string;
  notes: string | null;
  riskLevel: RiskLevel | null;
}

export interface PrescriptionItem {
  name: string;
  dosage: string;
  frequency: string;
  timesOfDay?: string[];
  durationDays: number | null;
  instructions?: string | null;
}

/** Written by doctors (P4) or by scanning a paper prescription (P2). */
export interface Prescription {
  id: string;
  patientId: string;
  prescribedBy: string | null;
  source: 'doctor' | 'scan';
  issuedAt: string;
  diagnosis: string | null;
  items: PrescriptionItem[];
  notes: string | null;
}

/** One scheduled dose and what happened to it (owned by P2). */
export interface DoseLog {
  id: string;
  patientId: string;
  prescriptionId: string | null;
  medicineName: string;
  scheduledAt: string;
  status: 'taken' | 'missed' | 'skipped' | 'pending';
  takenAt: string | null;
}

export type ReportCategory = 'blood_test' | 'cardiology' | 'prescription' | 'imaging' | 'xray';
export const REPORT_CATEGORIES: readonly { key: ReportCategory; label: string }[] = [
  { key: 'blood_test', label: 'Blood test' },
  { key: 'cardiology', label: 'Cardiology' },
  { key: 'prescription', label: 'Prescription' },
  { key: 'imaging', label: 'Imaging' },
  { key: 'xray', label: 'X-ray' },
];

export interface HealthReport {
  id: string;
  patientId: string;
  uploadedBy: string;
  category: ReportCategory;
  title: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  reportDate: string | null;
  createdAt: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  doctorId: string;
  facilityId: string | null;
  startedAt: string;
  notes: string | null;
  diagnosis: string | null;
  labOrders: string[];
  followUpDate: string | null;
  prescriptionId: string | null;
  referralId: string | null;
}

export type ReferralStatus = 'pending' | 'seen' | 'accepted' | 'closed';

/** ASHA worker → doctor/facility referral (created by P3, actioned by P4). */
export interface Referral {
  id: string;
  patientId: string;
  fromAshaId: string;
  toDoctorId: string | null;
  toFacilityId: string | null;
  reason: string;
  riskAlertId: string | null;
  status: ReferralStatus;
  createdAt: string;
  seenAt: string | null;
  acceptedAt: string | null;
}

/** High-risk flag raised by P3's ASHA module. */
export interface RiskAlert {
  id: string;
  patientId: string;
  ashaWorkerId: string;
  level: 'medium' | 'high';
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
}

export type AccessMethod = 'qr_scan' | 'direct';
export type AccessOutcome = 'granted' | 'denied';

/** One attempt to open a patient's history. Written by the server only. */
export interface AccessLog {
  id: string;
  patientId: string;
  viewerId: string;
  viewerRole: Role;
  viewerName: string | null;
  method: AccessMethod;
  outcome: AccessOutcome;
  /** Why access was granted (basis) or denied (reason code). */
  reason: string | null;
  createdAt: string;
}

/** P4-owned: the patient's "Share history" toggle. */
export interface PatientConsent {
  patientId: string;
  shareHistory: boolean;
  updatedAt: string;
}

/** P4-owned: access a doctor gained by scanning the patient's QR with consent. */
export interface AccessGrant {
  id: string;
  patientId: string;
  viewerId: string;
  grantedVia: 'qr_scan';
  tokenJti: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
