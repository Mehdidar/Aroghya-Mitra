/**
 * Data access used by the QR and records services.
 *
 * Two implementations:
 *  - `memoryRepository.ts`: in-memory, for tests and offline demos.
 *  - a Supabase implementation (service-role client inside an Edge Function),
 *    to be added once P1's shared tables exist. Row-level security in
 *    `supabase/migrations/4xxx_*.sql` enforces the same rules as
 *    `access.ts` for every other client.
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
} from '../../features/records/types.ts';

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
}
