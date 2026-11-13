/**
 * PROPOSED SHARED TYPES — owned by P1.
 *
 * P1's skeleton had not landed when this was written, so these are P3's proposal
 * for `Patient`, `Vitals`, `Visit`, `RiskAlert` and `Referral`. P4 reads
 * `RiskAlert` and `Referral` too. When P1's shared types land, replace this
 * file's body with re-exports from there and fix any field-name differences.
 */

export type ID = string;
export type ISODate = string; // ISO-8601 timestamp, e.g. 2026-11-13T09:30:00.000Z
export type Lang = 'en' | 'hi';
export type LocalizedText = Partial<Record<Lang, string>> & { en: string };

export type Role = 'asha' | 'doctor' | 'patient' | 'admin';
export interface AppUser {
  id: ID;
  role: Role;
  name: string;
}

export type PatientCategory = 'pregnant' | 'newborn' | 'elderly' | 'tb' | 'ncd' | 'general';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type Severity = Exclude<RiskLevel, 'none'>;

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM?: number;
}

export interface Patient {
  id: ID;
  name: string;
  sex: 'F' | 'M';
  /** Date of birth. Used to derive age in years, and age in days for newborns. */
  dob: ISODate;
  phone?: string;
  village: string;
  address?: string;
  categories: PatientCategory[];
  assignedAshaId: ID;
  pregnancy?: {
    lmp: ISODate; // last menstrual period, used to derive gestation weeks
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

/** Symptom codes captured on a visit. Rules match on these. */
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

export type VisitStatus = 'completed' | 'follow_up' | 'referred' | 'not_at_home';
export type SyncState = 'pending' | 'synced' | 'failed';

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

export interface RiskAlert {
  /** Deterministic: `${patientId}:${ruleId}:${visitId|recordedAt}`, so re-evaluating never duplicates. */
  id: ID;
  patientId: ID;
  visitId?: ID;
  ruleId: string;
  severity: Severity;
  /** Already rendered in the requested language, with the observed values filled in. */
  reason: string;
  /** i18n key, so P4 or the UI can re-render the reason in another language. */
  reasonKey: string;
  reasonParams: Record<string, string | number>;
  /** Which values tripped the rule. */
  evidence: { field: string; value: string | number; op: string; threshold: string | number }[];
  source: string;
  createdAt: ISODate;
  acknowledged?: boolean;
}

export type ReferralUrgency = 'routine' | 'urgent' | 'emergency';
export interface Referral {
  id: ID;
  patientId: ID;
  fromAshaId: ID;
  toDoctorId?: ID;
  reason: string;
  alertIds: ID[];
  urgency: ReferralUrgency;
  status: 'pending' | 'accepted' | 'seen' | 'closed';
  createdAt: ISODate;
  updatedAt: ISODate;
  notes?: string;
}
