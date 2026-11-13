/**
 * In-memory RecordsRepository for tests and offline demos. Not for production:
 * nothing is persisted and there is no row-level security.
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
import type { PatientRecordBundle, RecordsRepository } from './repository.ts';

export interface MemoryData {
  profiles: Profile[];
  patients: Patient[];
  consents: PatientConsent[];
  grants: AccessGrant[];
  redemptions: { jti: string; patientId: string; viewerId: string; redeemedAt: string }[];
  accessLogs: AccessLog[];
  vitals: VitalsReading[];
  ashaVisits: AshaVisit[];
  prescriptions: Prescription[];
  doseLogs: DoseLog[];
  reports: HealthReport[];
  consultations: Consultation[];
  referrals: Referral[];
  riskAlerts: RiskAlert[];
}

export function emptyMemoryData(): MemoryData {
  return {
    profiles: [],
    patients: [],
    consents: [],
    grants: [],
    redemptions: [],
    accessLogs: [],
    vitals: [],
    ashaVisits: [],
    prescriptions: [],
    doseLogs: [],
    reports: [],
    consultations: [],
    referrals: [],
    riskAlerts: [],
  };
}

export class MemoryRecordsRepository implements RecordsRepository {
  readonly data: MemoryData;
  private seq = 0;

  constructor(data: Partial<MemoryData> = {}) {
    this.data = { ...emptyMemoryData(), ...data };
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async getProfile(id: string) {
    return this.data.profiles.find((p) => p.id === id) ?? null;
  }

  async getPatient(id: string) {
    return this.data.patients.find((p) => p.id === id) ?? null;
  }

  async getConsent(patientId: string) {
    return this.data.consents.find((c) => c.patientId === patientId) ?? null;
  }

  async setConsent(patientId: string, shareHistory: boolean, now: Date) {
    const consent: PatientConsent = { patientId, shareHistory, updatedAt: now.toISOString() };
    this.data.consents = [...this.data.consents.filter((c) => c.patientId !== patientId), consent];
    return consent;
  }

  async findActiveGrant(patientId: string, viewerId: string, now: Date) {
    return (
      this.data.grants.find(
        (g) =>
          g.patientId === patientId &&
          g.viewerId === viewerId &&
          g.revokedAt === null &&
          Date.parse(g.expiresAt) > now.getTime(),
      ) ?? null
    );
  }

  async createGrant(grant: Omit<AccessGrant, 'id'>) {
    const row: AccessGrant = { id: this.nextId('grant'), ...grant };
    this.data.grants.push(row);
    return row;
  }

  async revokeGrants(patientId: string, now: Date) {
    let n = 0;
    for (const g of this.data.grants) {
      if (g.patientId === patientId && g.revokedAt === null) {
        g.revokedAt = now.toISOString();
        n++;
      }
    }
    return n;
  }

  async hasOpenReferralTo(patientId: string, doctor: Pick<Profile, 'id' | 'facilityId'>) {
    return this.data.referrals.some(
      (r) =>
        r.patientId === patientId &&
        r.status !== 'closed' &&
        (r.toDoctorId === doctor.id || (doctor.facilityId !== null && r.toFacilityId === doctor.facilityId)),
    );
  }

  async redeemToken(jti: string, patientId: string, viewerId: string, now: Date) {
    const existing = this.data.redemptions.find((r) => r.jti === jti);
    if (existing) return { firstViewerId: existing.viewerId };
    this.data.redemptions.push({ jti, patientId, viewerId, redeemedAt: now.toISOString() });
    return { firstViewerId: viewerId };
  }

  async insertAccessLog(entry: Omit<AccessLog, 'id'>) {
    const row: AccessLog = { id: this.nextId('log'), ...entry };
    this.data.accessLogs.push(row);
    return row;
  }

  async listAccessLogs(patientId: string, limit: number) {
    return this.data.accessLogs
      .filter((l) => l.patientId === patientId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  async loadRecordBundle(patientId: string): Promise<PatientRecordBundle | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;
    const mine = <T extends { patientId: string }>(rows: T[]) => rows.filter((r) => r.patientId === patientId);
    const bundle = {
      patient,
      vitals: mine(this.data.vitals),
      ashaVisits: mine(this.data.ashaVisits),
      prescriptions: mine(this.data.prescriptions),
      doseLogs: mine(this.data.doseLogs),
      reports: mine(this.data.reports),
      consultations: mine(this.data.consultations),
      referrals: mine(this.data.referrals),
      riskAlerts: mine(this.data.riskAlerts),
    };
    const ids = new Set<string>();
    for (const v of bundle.ashaVisits) ids.add(v.ashaWorkerId);
    for (const c of bundle.consultations) ids.add(c.doctorId);
    for (const p of bundle.prescriptions) if (p.prescribedBy) ids.add(p.prescribedBy);
    for (const r of bundle.reports) ids.add(r.uploadedBy);
    for (const r of bundle.referrals) ids.add(r.fromAshaId);
    for (const a of bundle.riskAlerts) ids.add(a.ashaWorkerId);
    const people = this.data.profiles
      .filter((p) => ids.has(p.id))
      .map((p) => ({ id: p.id, fullName: p.fullName, role: p.role }));
    return { ...bundle, people };
  }
}
