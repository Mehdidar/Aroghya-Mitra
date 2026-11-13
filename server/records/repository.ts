/**
 * Data access used by the QR and records services.
 *
 * Two implementations:
 *  - `memoryRepository.ts`: in-memory, for tests and offline demos.
 *  - `supabaseRepository.ts`: Supabase over PostgREST with the service-role
 *    key (server only), chosen when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *    are set. Row-level security in `supabase/migrations/4xxx_*.sql` enforces
 *    the same rules as `access.ts` for every other client.
 */
import type {
  AccessGrant,
  AccessLog,
  AshaVisit,
  Consultation,
  DoseLog,
  HealthReport,
  Patient,
  PatientConsent,
  Prescription,
  Profile,
  Referral,
  RiskAlert,
  VitalsReading,
} from '../../packages/records/records/types.ts';
import type { AshaBatch } from '../asha/toRecords.ts';

/** Everything needed to render one patient's history. */
export interface PatientRecordBundle {
  patient: Patient;
  vitals: VitalsReading[];
  ashaVisits: AshaVisit[];
  prescriptions: Prescription[];
  doseLogs: DoseLog[];
  reports: HealthReport[];
  consultations: Consultation[];
  referrals: Referral[];
  riskAlerts: RiskAlert[];
  /** Names of the people who appear in the records (doctors, ASHA workers). */
  people: Pick<Profile, 'id' | 'fullName' | 'role'>[];
}

export interface RecordsRepository {
  getProfile(id: string): Promise<Profile | null>;
  getPatient(id: string): Promise<Patient | null>;

  getConsent(patientId: string): Promise<PatientConsent | null>;
  setConsent(patientId: string, shareHistory: boolean, now: Date): Promise<PatientConsent>;

  findActiveGrant(patientId: string, viewerId: string, now: Date): Promise<AccessGrant | null>;
  createGrant(grant: Omit<AccessGrant, 'id'>): Promise<AccessGrant>;
  /** Revokes every open grant for the patient; returns how many were revoked. */
  revokeGrants(patientId: string, now: Date): Promise<number>;

  /** True if an open (not closed) referral for the patient is addressed to this doctor or their facility. */
  hasOpenReferralTo(patientId: string, doctor: Pick<Profile, 'id' | 'facilityId'>): Promise<boolean>;

  /**
   * Records that a QR token was redeemed. Insert-if-absent: returns the viewer
   * who redeemed it first (which is `viewerId` on first use).
   */
  redeemToken(jti: string, patientId: string, viewerId: string, now: Date): Promise<{ firstViewerId: string }>;

  insertAccessLog(entry: Omit<AccessLog, 'id'>): Promise<AccessLog>;
  /** Newest first. */
  listAccessLogs(patientId: string, limit: number): Promise<AccessLog[]>;

  loadRecordBundle(patientId: string): Promise<PatientRecordBundle | null>;

  /** The patient record a signed-in patient owns. */
  findPatientByUser(userId: string): Promise<Patient | null>;
  getReferral(id: string): Promise<Referral | null>;

  // Writes from the phones (server/records/push.ts checks who may write what first).
  // Each is an upsert by id, so sending the same record twice is harmless.
  savePrescription(p: Prescription): Promise<Prescription>;
  saveConsultation(c: Consultation): Promise<Consultation>;
  saveDoseLog(d: DoseLog): Promise<DoseLog>;
  saveVitals(v: VitalsReading): Promise<VitalsReading>;
  saveReport(r: HealthReport): Promise<HealthReport>;
  updateReferral(id: string, patch: ReferralPatch): Promise<Referral | null>;

  /**
   * First sign-in of a new patient: a 'patient' profile and an empty patient
   * record owned by this auth user. Returns what already exists if called again.
   */
  registerPatientUser(userId: string, phone: string | null, now: Date): Promise<{ profile: Profile; patient: Patient }>;

  /** Mirror one ASHA sync into the records (patients, visits, alerts, referrals). */
  saveAshaBatch(batch: AshaBatch): Promise<void>;
  /** A doctor's inbox: open referrals to them or their facility, with the patients and their open alerts. */
  listInbox(doctor: Pick<Profile, 'id' | 'facilityId'>): Promise<DoctorInbox>;
}

export interface DoctorInbox {
  referrals: Referral[];
  riskAlerts: RiskAlert[];
  patients: Patient[];
}

/** The referral fields a doctor changes from the inbox. */
export type ReferralPatch = Partial<Pick<Referral, 'status' | 'seenAt' | 'acceptedAt'>>;
