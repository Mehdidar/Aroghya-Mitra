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
} from '../../packages/records/records/types.ts';
import { sameRecord } from '../../packages/shared/ids.ts';
import { alertToRecord, ashaPatientToRecord, furtherStatus, referralToRecord, visitToRecord, type AshaBatch } from '../asha/toRecords.ts';
import type { DoctorInbox, LabResult, PatientRecordBundle, RecordsRepository, ReferralPatch } from './repository.ts';

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
  labResults: LabResult[];
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
    labResults: [],
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

  async findPatientByUser(userId: string) {
    return this.data.patients.find((p) => p.userId === userId) ?? null;
  }

  async getReferral(id: string) {
    return this.data.referrals.find((r) => r.id === id) ?? null;
  }

  private put<K extends 'prescriptions' | 'consultations' | 'doseLogs' | 'vitals' | 'reports'>(key: K, row: MemoryData[K][number]) {
    const rows = this.data[key] as { id: string }[];
    const i = rows.findIndex((r) => r.id === row.id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
    return row;
  }

  async savePrescription(p: Prescription) {
    return this.put('prescriptions', p);
  }
  async saveConsultation(c: Consultation) {
    return this.put('consultations', c);
  }
  async saveDoseLog(d: DoseLog) {
    return this.put('doseLogs', d);
  }
  async saveVitals(v: VitalsReading) {
    return this.put('vitals', v);
  }
  async saveReport(r: HealthReport) {
    return this.put('reports', r);
  }

  async updateReferral(id: string, patch: ReferralPatch) {
    const r = this.data.referrals.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    return r;
  }

  async saveAshaBatch(batch: AshaBatch) {
    for (const p of batch.patients) {
      if (!this.data.patients.some((x) => x.id === p.id)) this.data.patients.push(ashaPatientToRecord(p));
    }
    for (const v of batch.visits) {
      const row = visitToRecord(v, batch.alerts);
      const i = this.data.ashaVisits.findIndex((x) => x.id === v.id);
      if (i >= 0) this.data.ashaVisits[i] = row;
      else this.data.ashaVisits.push(row);
    }
    const reVisited = new Set(batch.visits.map((v) => v.id));
    const replaced = new Set(batch.alerts.map((a) => a.id));
    const visitOf = new Map(batch.alerts.map((a) => [a.id, a.visitId]));
    this.data.riskAlerts = this.data.riskAlerts.filter((a) => !replaced.has(a.id) && !(visitOf.get(a.id) && reVisited.has(visitOf.get(a.id)!)));
    for (const a of batch.alerts) {
      const ashaId = batch.visits.find((v) => v.id === a.visitId)?.ashaId ?? batch.referrals.find((r) => r.patientId === a.patientId)?.fromAshaId ?? '';
      this.data.riskAlerts.push(alertToRecord(a, ashaId));
    }
    for (const r of batch.referrals) {
      const row = referralToRecord(r);
      const existing = this.data.referrals.find((x) => sameRecord(x.id, r.id));
      if (existing) Object.assign(existing, { ...row, id: existing.id, status: furtherStatus(existing.status, row.status), seenAt: existing.seenAt ?? row.seenAt, acceptedAt: existing.acceptedAt ?? row.acceptedAt, toDoctorId: row.toDoctorId ?? existing.toDoctorId });
      else this.data.referrals.push(row);
    }
  }

  async listInbox(doctor: Pick<Profile, 'id' | 'facilityId'>): Promise<DoctorInbox> {
    const referrals = this.data.referrals.filter(
      (r) => r.status !== 'closed' && (r.toDoctorId === doctor.id || (doctor.facilityId !== null && r.toFacilityId === doctor.facilityId)),
    );
    const ids = new Set(referrals.map((r) => r.patientId));
    return {
      referrals,
      riskAlerts: this.data.riskAlerts.filter((a) => ids.has(a.patientId) && a.resolvedAt === null),
      patients: this.data.patients.filter((p) => ids.has(p.id)),
    };
  }

  async listLabResults(patientId: string) {
    return this.data.labResults.filter((r) => r.patientId === patientId).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  }

  async saveLabResults(rows: LabResult[]) {
    for (const row of rows) {
      const i = this.data.labResults.findIndex((r) => r.id === row.id);
      if (i >= 0) this.data.labResults[i] = row;
      else this.data.labResults.push(row);
    }
    return rows;
  }

  async registerPatientUser(userId: string, phone: string | null, now: Date) {
    let profile = this.data.profiles.find((p) => p.id === userId);
    if (!profile) {
      profile = { id: userId, role: 'patient', fullName: newPatientName(phone), facilityId: null, isActive: true };
      this.data.profiles.push(profile);
    }
    let patient = this.data.patients.find((p) => p.userId === userId);
    if (!patient) {
      patient = { id: `pt-${userId}`, userId, fullName: profile.fullName, dateOfBirth: null, sex: null, phone, facilityId: null, ashaWorkerId: null, area: null, bloodGroup: null, allergies: [], chronicConditions: [], createdAt: now.toISOString() };
      this.data.patients.push(patient);
    }
    return { profile, patient };
  }
}

/** Placeholder name until the patient fills in their profile. */
export const newPatientName = (phone: string | null) => (phone ? `Patient ${phone.replace(/\D/g, '').slice(-4)}` : 'New patient');
