/**
 * @am/shared types: the one source of truth for the domain model.
 *
 * Three teams wrote types separately: P3's field-level ASHA model (visits,
 * vitals, rule-based alerts), P4's record-level model (what the database and
 * the doctor's screens see) and P2's prescription / dose types. They are all
 * here, under one name each, and the old module files re-export them under
 * the names the existing code uses, so nothing had to be rewritten.
 *
 * Where two teams modelled the same thing at different levels of detail
 * both shapes are kept and named by level:
 *
 *   AshaPatient / Patient          the caseload card vs the database row
 *   RiskAlert   / RecordRiskAlert  the rule evidence vs the summary a doctor sees
 *   Referral    / RecordReferral   the ASHA's outbox row vs the inbox row
 *   RiskLevel   / RecordRiskLevel  five levels on the phone, three in records
 *
 * Conventions: ids are strings (UUIDs once they leave the phone), timestamps
 * are ISO-8601 (UTC), dates without time are YYYY-MM-DD, DB columns are
 * snake_case.
 */

// ----------------------------------------------------------------- primitives

export type ID = string;
export type ISODate = string; // 2026-11-13T09:30:00.000Z
export type DateOnly = string; // 2026-11-13

export type Role = 'patient' | 'asha' | 'doctor' | 'admin';
export const ROLES: readonly Role[] = ['patient', 'asha', 'doctor', 'admin'];

/** The two languages the ASHA rule engine renders alert text in. */
export type Lang = 'en' | 'hi';
export type LocalizedText = Partial<Record<Lang, string>> & { en: string };

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export const BLOOD_GROUPS: readonly BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM?: number;
}

// --------------------------------------------------------------- people & org

export interface Facility {
  id: ID;
  name: string;
  kind: 'phc' | 'chc' | 'district_hospital' | 'private';
  area: string | null;
}

/** A signed-in user (doctor, ASHA worker, admin, or patient with an account). */
export interface Profile {
  id: ID;
  role: Role;
  fullName: string;
  facilityId: ID | null;
  isActive: boolean;
}

export interface AppUser {
  id: ID;
  role: Role;
  name: string;
}

// -------------------------------------------------------------------- patient

export type PatientCategory = 'pregnant' | 'newborn' | 'elderly' | 'tb' | 'ncd' | 'general';

/** Five-level risk on the phone (ASHA rule engine). */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type Severity = Exclude<RiskLevel, 'none'>;
/** Three-level risk in records (what a doctor's list shows). */
export type RecordRiskLevel = 'low' | 'medium' | 'high';

/** A registered patient as stored in `patients`. `userId` is null when a doctor registered them and they have no app account. */
export interface Patient {
  id: ID;
  userId: ID | null;
  fullName: string;
  dateOfBirth: DateOnly | null;
  sex: 'male' | 'female' | 'other' | null;
  phone: string | null;
  facilityId: ID | null;
  ashaWorkerId: ID | null;
  area: string | null;
  bloodGroup: BloodGroup | null;
  allergies: string[];
  chronicConditions: string[];
  createdAt: ISODate;
}

/** The same patient as the ASHA app carries them in the field: categories, pregnancy, newborn and home location. */
export interface AshaPatient {
  id: ID;
  name: string;
  sex: 'F' | 'M';
  /** Date of birth. Age in years, or age in days for newborns, is derived from it. */
  dob: ISODate;
  phone?: string;
  village: string;
  address?: string;
  categories: PatientCategory[];
  assignedAshaId: ID;
  pregnancy?: {
    lmp: ISODate; // last menstrual period, gestation weeks are derived from it
    gravida?: number;
  };
  newborn?: {
    birthWeightKg?: number;
    motherId?: ID;
  };
  /** Known conditions, e.g. 'hypertension', 'diabetes', 'tb_on_treatment'. */
  conditions?: string[];
  home?: GeoPoint;
  /** Highest severity among open alerts. Cached locally, recomputed on every saved visit. */
  riskLevel?: RiskLevel;
}

// --------------------------------------------------------------------- vitals

/** Symptom codes captured on a visit. The rule engine matches on these. */
export type Symptom =
  | 'bleeding_pv'
  | 'severe_headache'
  | 'blurred_vision'
  | 'convulsions'
  | 'swelling_face_hands'
  | 'fever'
  | 'leaking_fluid'
  | 'severe_abdominal_pain'
  | 'breathlessness'
  | 'not_feeding'
  | 'lethargy'
  | 'jaundice'
  | 'umbilical_redness'
  | 'chest_indrawing'
  | 'cold_to_touch'
  | 'cough_2_weeks'
  | 'hemoptysis'
  | 'weight_loss'
  | 'night_sweats'
  | 'chest_pain';

/** Everything an ASHA can measure or observe on one visit. */
export interface Vitals {
  recordedAt: ISODate;
  systolic?: number; // mmHg
  diastolic?: number; // mmHg
  hemoglobin?: number; // g/dL
  weightKg?: number;
  temperatureC?: number;
  pulse?: number; // beats/min
  respRate?: number; // breaths/min
  spo2?: number; // %
  bloodSugarRandom?: number; // mg/dL
  bloodSugarFasting?: number; // mg/dL
  fetalMovement?: 'normal' | 'reduced' | 'absent';
  symptoms?: Symptom[];
}

export type VitalsSource = 'asha_visit' | 'consultation' | 'self' | 'device';

/** One stored reading in the records timeline (a subset of Vitals with provenance). */
export interface VitalsReading {
  id: ID;
  patientId: ID;
  recordedAt: ISODate;
  recordedBy: ID | null;
  source: VitalsSource;
  heartRate?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  weightKg?: number | null;
  spo2?: number | null;
  temperatureC?: number | null;
  bloodSugarMgDl?: number | null;
}

// --------------------------------------------------------------------- visits

export type VisitStatus = 'completed' | 'follow_up' | 'referred' | 'not_at_home';
export type SyncState = 'pending' | 'synced' | 'failed';

/** An ASHA home visit as recorded on the phone. */
export interface Visit {
  id: ID;
  patientId: ID;
  ashaId: ID;
  visitedAt: ISODate;
  status: VisitStatus;
  gps?: GeoPoint;
  vitals?: Vitals;
  notes?: string;
  /** Local file URIs before upload; remote URLs after. */
  photos: string[];
  followUpOn?: ISODate;
  source: 'manual' | 'voice';
  transcript?: string;
  /** Last-write-wins clock: the later updatedAt wins a conflict. */
  updatedAt: ISODate;
  /** Local only, never sent to the server. */
  syncState?: SyncState;
}

/** The visit as the records timeline shows it. */
export interface AshaVisit {
  id: ID;
  patientId: ID;
  ashaWorkerId: ID;
  visitedAt: ISODate;
  notes: string | null;
  riskLevel: RecordRiskLevel | null;
}

// --------------------------------------------------------------------- alerts

/** A rule-engine alert with its evidence (ASHA app and server/risk). */
export interface RiskAlert {
  /** Deterministic: `${patientId}:${ruleId}:${visitId|recordedAt}`, so re-evaluating never duplicates. */
  id: ID;
  patientId: ID;
  visitId?: ID;
  ruleId: string;
  severity: Severity;
  /** Already rendered in the requested language, with the observed values filled in. */
  reason: string;
  /** i18n key, so the UI can re-render the reason in another language. */
  reasonKey: string;
  reasonParams: Record<string, string | number>;
  /** Which values tripped the rule. */
  evidence: { field: string; value: string | number; op: string; threshold: string | number }[];
  source: string;
  createdAt: ISODate;
  acknowledged?: boolean;
}

/** The alert as a doctor's record view summarises it. */
export interface RecordRiskAlert {
  id: ID;
  patientId: ID;
  ashaWorkerId: ID;
  level: 'medium' | 'high';
  reason: string;
  createdAt: ISODate;
  resolvedAt: ISODate | null;
}

// ------------------------------------------------------------------ referrals

export type ReferralUrgency = 'routine' | 'urgent' | 'emergency';
export type ReferralStatus = 'pending' | 'seen' | 'accepted' | 'closed';

/** The referral as the ASHA app creates and syncs it. */
export interface Referral {
  id: ID;
  patientId: ID;
  fromAshaId: ID;
  toDoctorId?: ID;
  reason: string;
  alertIds: ID[];
  urgency: ReferralUrgency;
  status: ReferralStatus;
  createdAt: ISODate;
  updatedAt: ISODate;
  notes?: string;
}

/** The referral as the doctor's inbox reads it from `referrals`. */
export interface RecordReferral {
  id: ID;
  patientId: ID;
  fromAshaId: ID;
  toDoctorId: ID | null;
  toFacilityId: ID | null;
  reason: string;
  riskAlertId: ID | null;
  status: ReferralStatus;
  createdAt: ISODate;
  seenAt: ISODate | null;
  acceptedAt: ISODate | null;
}

// -------------------------------------------------------- prescriptions, doses

export type DoseSlot = 'morning' | 'afternoon' | 'evening' | 'night';
export const DOSE_SLOTS: readonly DoseSlot[] = ['morning', 'afternoon', 'evening', 'night'];

export type MealRelation = 'before_food' | 'after_food' | 'with_food' | 'empty_stomach' | 'any';

export interface PrescriptionItem {
  name: string;
  dosage: string;
  frequency: string;
  timesOfDay?: string[];
  durationDays: number | null;
  instructions?: string | null;
}

/** Written by doctors (consultation) or by scanning a paper prescription (patient app). */
export interface Prescription {
  id: ID;
  patientId: ID;
  prescribedBy: ID | null;
  source: 'doctor' | 'scan';
  issuedAt: ISODate;
  diagnosis: string | null;
  items: PrescriptionItem[];
  notes: string | null;
}

/** One scheduled dose and what happened to it. */
export interface DoseLog {
  id: ID;
  patientId: ID;
  prescriptionId: ID | null;
  medicineName: string;
  scheduledAt: ISODate;
  status: 'taken' | 'missed' | 'skipped' | 'pending';
  takenAt: ISODate | null;
}

// ------------------------------------------------------------------- records

export type ReportCategory = 'blood_test' | 'cardiology' | 'prescription' | 'imaging' | 'xray';
export const REPORT_CATEGORIES: readonly { key: ReportCategory; label: string }[] = [
  { key: 'blood_test', label: 'Blood test' },
  { key: 'cardiology', label: 'Cardiology' },
  { key: 'prescription', label: 'Prescription' },
  { key: 'imaging', label: 'Imaging' },
  { key: 'xray', label: 'X-ray' },
];

export interface HealthReport {
  id: ID;
  patientId: ID;
  uploadedBy: ID;
  category: ReportCategory;
  title: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  reportDate: DateOnly | null;
  createdAt: ISODate;
}

export interface Consultation {
  id: ID;
  patientId: ID;
  doctorId: ID;
  facilityId: ID | null;
  startedAt: ISODate;
  notes: string | null;
  diagnosis: string | null;
  labOrders: string[];
  followUpDate: DateOnly | null;
  prescriptionId: ID | null;
  referralId: ID | null;
}

export type AccessMethod = 'qr_scan' | 'direct';
export type AccessOutcome = 'granted' | 'denied';

/** One attempt to open a patient's history. Written by the server only. */
export interface AccessLog {
  id: ID;
  patientId: ID;
  viewerId: ID;
  viewerRole: Role;
  viewerName: string | null;
  method: AccessMethod;
  outcome: AccessOutcome;
  /** Why access was granted (basis) or denied (reason code). */
  reason: string | null;
  createdAt: ISODate;
}

/** The patient's "Share history" toggle. */
export interface PatientConsent {
  patientId: ID;
  shareHistory: boolean;
  updatedAt: ISODate;
}

/** Access a doctor gained by scanning the patient's QR with consent. */
export interface AccessGrant {
  id: ID;
  patientId: ID;
  viewerId: ID;
  grantedVia: 'qr_scan';
  tokenJti: string;
  createdAt: ISODate;
  expiresAt: ISODate;
  revokedAt: ISODate | null;
}
