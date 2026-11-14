/**
 * RecordsRepository on Supabase (PostgREST + service-role key). Server only.
 *
 * Column names follow supabase/migrations/1000_base.sql, 3001_asha.sql and
 * 4001_p4_records.sql. Ids that are not UUIDs (the app's `rx-…` ids, the demo
 * seed's `vit-1`) are stored under `toDbId(id)`, a stable UUID, so rows read
 * back carry UUID ids; the phone matches them with `sameRecord`.
 */
import { toDbId } from '../../packages/shared/ids.ts';
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
import { DbError, inList, type RestClient } from '../db/rest.ts';
import { DEMO_FACILITY } from '../../packages/shared/demo.ts';
import { furtherStatus, type AshaBatch } from '../asha/toRecords.ts';
import { newPatientName } from './memoryRepository.ts';
import type { DoctorInbox, LabResult, PatientRecordBundle, RecordsRepository, ReferralPatch } from './repository.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const dbIdOrNull = (id: string | null | undefined) => (id ? toDbId(id) : null);

// ---- row <-> record mappers ---------------------------------------------------

export const mapProfile = (r: Row): Profile => ({
  id: String(r.id),
  role: r.role as Profile['role'],
  fullName: String(r.full_name),
  facilityId: s(r.facility_id),
  isActive: r.is_active !== false,
});

export const mapPatient = (r: Row): Patient => ({
  id: String(r.id),
  userId: s(r.user_id),
  fullName: String(r.full_name),
  dateOfBirth: s(r.date_of_birth),
  sex: (r.sex as Patient['sex']) ?? null,
  phone: s(r.phone),
  facilityId: s(r.facility_id),
  ashaWorkerId: s(r.asha_worker_id),
  area: s(r.area),
  bloodGroup: (r.blood_group as Patient['bloodGroup']) ?? null,
  allergies: (r.allergies as string[]) ?? [],
  chronicConditions: (r.chronic_conditions as string[]) ?? [],
  createdAt: String(r.created_at),
});

export const patientRow = (p: Patient): Row => ({
  id: toDbId(p.id),
  user_id: p.userId,
  full_name: p.fullName,
  date_of_birth: p.dateOfBirth,
  sex: p.sex,
  phone: p.phone,
  facility_id: p.facilityId,
  asha_worker_id: p.ashaWorkerId,
  area: p.area,
  blood_group: p.bloodGroup,
  allergies: p.allergies,
  chronic_conditions: p.chronicConditions,
  created_at: p.createdAt,
});

const mapVitals = (r: Row): VitalsReading => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  recordedAt: String(r.recorded_at),
  recordedBy: s(r.recorded_by),
  source: r.source as VitalsReading['source'],
  heartRate: n(r.heart_rate),
  systolic: n(r.systolic),
  diastolic: n(r.diastolic),
  weightKg: n(r.weight_kg),
  spo2: n(r.spo2),
  temperatureC: n(r.temperature_c),
  bloodSugarMgDl: n(r.blood_sugar_mg_dl),
});

const vitalsRow = (v: VitalsReading): Row => ({
  id: toDbId(v.id),
  patient_id: toDbId(v.patientId),
  recorded_at: v.recordedAt,
  recorded_by: v.recordedBy,
  source: v.source,
  heart_rate: v.heartRate ?? null,
  systolic: v.systolic ?? null,
  diastolic: v.diastolic ?? null,
  weight_kg: v.weightKg ?? null,
  spo2: v.spo2 ?? null,
  temperature_c: v.temperatureC ?? null,
  blood_sugar_mg_dl: v.bloodSugarMgDl ?? null,
});

const mapVisit = (r: Row, alerts: Row[]): AshaVisit => {
  const mine = alerts.filter((a) => a.visit_id === r.id).map((a) => String(a.severity));
  const worst = ['critical', 'high', 'medium', 'low'].find((lvl) => mine.includes(lvl));
  return {
    id: String(r.id),
    patientId: String(r.patient_id),
    ashaWorkerId: String(r.asha_id),
    visitedAt: String(r.visited_at),
    notes: s(r.notes),
    riskLevel: worst === 'critical' ? 'high' : ((worst as AshaVisit['riskLevel']) ?? null),
  };
};

const mapPrescription = (r: Row): Prescription => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  prescribedBy: s(r.prescribed_by),
  source: r.source as Prescription['source'],
  issuedAt: String(r.issued_at),
  diagnosis: s(r.diagnosis),
  items: (r.items as Prescription['items']) ?? [],
  notes: s(r.notes),
});

const prescriptionRow = (p: Prescription): Row => ({
  id: toDbId(p.id),
  patient_id: toDbId(p.patientId),
  prescribed_by: p.prescribedBy,
  source: p.source,
  issued_at: p.issuedAt,
  diagnosis: p.diagnosis,
  items: p.items,
  notes: p.notes,
});

const mapDose = (r: Row): DoseLog => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  prescriptionId: s(r.prescription_id),
  medicineName: String(r.medicine_name),
  scheduledAt: String(r.scheduled_at),
  status: r.status as DoseLog['status'],
  takenAt: s(r.taken_at),
});

const doseRow = (d: DoseLog): Row => ({
  id: toDbId(d.id),
  patient_id: toDbId(d.patientId),
  prescription_id: dbIdOrNull(d.prescriptionId),
  medicine_name: d.medicineName,
  scheduled_at: d.scheduledAt,
  status: d.status,
  taken_at: d.takenAt,
});

const mapReport = (r: Row): HealthReport => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  uploadedBy: String(r.uploaded_by),
  category: r.category as HealthReport['category'],
  title: String(r.title),
  storagePath: String(r.storage_path),
  mimeType: String(r.mime_type),
  sizeBytes: Number(r.size_bytes),
  reportDate: s(r.report_date),
  createdAt: String(r.created_at),
});

const reportRow = (r: HealthReport): Row => ({
  id: toDbId(r.id),
  patient_id: toDbId(r.patientId),
  uploaded_by: r.uploadedBy,
  category: r.category,
  title: r.title,
  // The table checks that the path starts with the patient id.
  storage_path: `${toDbId(r.patientId)}/${r.storagePath.split('/').slice(1).join('/') || r.storagePath}`,
  mime_type: r.mimeType,
  size_bytes: r.sizeBytes,
  report_date: r.reportDate,
  created_at: r.createdAt,
});

const mapConsultation = (r: Row): Consultation => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  doctorId: String(r.doctor_id),
  facilityId: s(r.facility_id),
  startedAt: String(r.started_at),
  notes: s(r.notes),
  diagnosis: s(r.diagnosis),
  labOrders: (r.lab_orders as string[]) ?? [],
  followUpDate: s(r.follow_up_date),
  prescriptionId: s(r.prescription_id),
  referralId: s(r.referral_id),
});

const consultationRow = (c: Consultation): Row => ({
  id: toDbId(c.id),
  patient_id: toDbId(c.patientId),
  doctor_id: c.doctorId,
  facility_id: c.facilityId,
  started_at: c.startedAt,
  notes: c.notes,
  diagnosis: c.diagnosis,
  lab_orders: c.labOrders,
  follow_up_date: c.followUpDate,
  prescription_id: dbIdOrNull(c.prescriptionId),
  referral_id: dbIdOrNull(c.referralId),
});

export const mapReferral = (r: Row): Referral => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  fromAshaId: String(r.from_asha_id),
  toDoctorId: s(r.to_doctor_id),
  toFacilityId: s(r.to_facility_id),
  reason: String(r.reason),
  riskAlertId: s(r.risk_alert_id),
  status: r.status as Referral['status'],
  createdAt: String(r.created_at),
  seenAt: s(r.seen_at),
  acceptedAt: s(r.accepted_at),
});

export const referralRow = (r: Referral): Row => ({
  id: toDbId(r.id),
  patient_id: toDbId(r.patientId),
  from_asha_id: r.fromAshaId,
  to_doctor_id: r.toDoctorId,
  to_facility_id: r.toFacilityId,
  reason: r.reason,
  risk_alert_id: r.riskAlertId,
  status: r.status,
  created_at: r.createdAt,
  seen_at: r.seenAt,
  accepted_at: r.acceptedAt,
});

const mapAlert = (r: Row): RiskAlert => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  ashaWorkerId: String(r.asha_id ?? ''),
  level: r.severity === 'high' || r.severity === 'critical' ? 'high' : 'medium',
  reason: String(r.reason),
  createdAt: String(r.created_at),
  resolvedAt: s(r.resolved_at),
});

const mapGrant = (r: Row): AccessGrant => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  viewerId: String(r.viewer_id),
  grantedVia: 'qr_scan',
  tokenJti: String(r.token_jti),
  createdAt: String(r.created_at),
  expiresAt: String(r.expires_at),
  revokedAt: s(r.revoked_at),
});

const mapLog = (r: Row): AccessLog => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  viewerId: String(r.viewer_id),
  viewerRole: r.viewer_role as AccessLog['viewerRole'],
  viewerName: s(r.viewer_name),
  method: r.method as AccessLog['method'],
  outcome: r.outcome as AccessLog['outcome'],
  reason: s(r.reason),
  createdAt: String(r.created_at),
});

// ---- the repository -----------------------------------------------------------

// lab_results (5001_lab_results.sql)
export const mapLabResult = (r: Row): LabResult => ({
  id: String(r.id),
  patientId: String(r.patient_id),
  reportId: s(r.report_id),
  testCode: String(r.test_code),
  testName: String(r.test_name),
  value: Number(r.value),
  unit: String(r.unit),
  referenceLow: n(r.reference_low),
  referenceHigh: n(r.reference_high),
  observedAt: String(r.observed_at),
  enteredBy: String(r.entered_by),
  source: r.source === 'extracted' ? 'extracted' : 'manual',
  createdAt: String(r.created_at),
});

export const labResultRow = (l: LabResult): Row => ({
  id: toDbId(l.id),
  patient_id: toDbId(l.patientId),
  report_id: dbIdOrNull(l.reportId),
  test_code: l.testCode,
  test_name: l.testName,
  value: l.value,
  unit: l.unit,
  reference_low: l.referenceLow,
  reference_high: l.referenceHigh,
  observed_at: l.observedAt,
  entered_by: toDbId(l.enteredBy),
  source: l.source,
  created_at: l.createdAt,
});

export class SupabaseRecordsRepository implements RecordsRepository {
  private readonly db: RestClient;
  constructor(db: RestClient) {
    this.db = db;
  }

  async getProfile(id: string) {
    const r = await this.db.selectOne<Row>('profiles', { id: `eq.${toDbId(id)}` });
    return r ? mapProfile(r) : null;
  }

  async getPatient(id: string) {
    const r = await this.db.selectOne<Row>('patients', { id: `eq.${toDbId(id)}` });
    return r ? mapPatient(r) : null;
  }

  async findPatientByUser(userId: string) {
    const r = await this.db.selectOne<Row>('patients', { user_id: `eq.${toDbId(userId)}` });
    return r ? mapPatient(r) : null;
  }

  async getConsent(patientId: string): Promise<PatientConsent | null> {
    const r = await this.db.selectOne<Row>('patient_consents', { patient_id: `eq.${toDbId(patientId)}` });
    return r ? { patientId: String(r.patient_id), shareHistory: r.share_history === true, updatedAt: String(r.updated_at) } : null;
  }

  async setConsent(patientId: string, shareHistory: boolean, now: Date) {
    const [r] = await this.db.upsert<Row>('patient_consents', { patient_id: toDbId(patientId), share_history: shareHistory, updated_at: now.toISOString() }, 'patient_id');
    return { patientId: String(r.patient_id), shareHistory: r.share_history === true, updatedAt: String(r.updated_at) };
  }

  async findActiveGrant(patientId: string, viewerId: string, now: Date) {
    const rows = await this.db.select<Row>(
      'record_access_grants',
      { patient_id: `eq.${toDbId(patientId)}`, viewer_id: `eq.${toDbId(viewerId)}`, revoked_at: 'is.null', expires_at: `gt.${now.toISOString()}` },
      { order: 'expires_at.desc', limit: 1 },
    );
    return rows[0] ? mapGrant(rows[0]) : null;
  }

  async createGrant(grant: Omit<AccessGrant, 'id'>) {
    const [r] = await this.db.insert<Row>('record_access_grants', {
      patient_id: toDbId(grant.patientId),
      viewer_id: toDbId(grant.viewerId),
      granted_via: grant.grantedVia,
      token_jti: grant.tokenJti,
      created_at: grant.createdAt,
      expires_at: grant.expiresAt,
      revoked_at: grant.revokedAt,
    });
    return mapGrant(r);
  }

  async revokeGrants(patientId: string, now: Date) {
    const rows = await this.db.update<Row>('record_access_grants', { patient_id: `eq.${toDbId(patientId)}`, revoked_at: 'is.null' }, { revoked_at: now.toISOString() });
    return rows.length;
  }

  async hasOpenReferralTo(patientId: string, doctor: Pick<Profile, 'id' | 'facilityId'>) {
    const or = doctor.facilityId ? `(to_doctor_id.eq.${toDbId(doctor.id)},to_facility_id.eq.${toDbId(doctor.facilityId)})` : `(to_doctor_id.eq.${toDbId(doctor.id)})`;
    const rows = await this.db.select<Row>('referrals', { patient_id: `eq.${toDbId(patientId)}`, status: 'neq.closed', or }, { columns: 'id', limit: 1 });
    return rows.length > 0;
  }

  async redeemToken(jti: string, patientId: string, viewerId: string, now: Date) {
    // Insert-if-absent, then read back whoever redeemed it first.
    await this.db.upsert<Row>('qr_token_redemptions', { jti, patient_id: toDbId(patientId), viewer_id: toDbId(viewerId), redeemed_at: now.toISOString() }, 'jti', { ignore: true });
    const r = await this.db.selectOne<Row>('qr_token_redemptions', { jti: `eq.${jti}` });
    return { firstViewerId: r ? String(r.viewer_id) : toDbId(viewerId) };
  }

  async insertAccessLog(entry: Omit<AccessLog, 'id'>) {
    const [r] = await this.db.insert<Row>('access_logs', {
      patient_id: toDbId(entry.patientId),
      viewer_id: toDbId(entry.viewerId),
      viewer_role: entry.viewerRole,
      viewer_name: entry.viewerName,
      method: entry.method,
      outcome: entry.outcome,
      reason: entry.reason,
      created_at: entry.createdAt,
    });
    return mapLog(r);
  }

  async listAccessLogs(patientId: string, limit: number) {
    const rows = await this.db.select<Row>('access_logs', { patient_id: `eq.${toDbId(patientId)}` }, { order: 'created_at.desc', limit });
    return rows.map(mapLog);
  }

  async loadRecordBundle(patientId: string): Promise<PatientRecordBundle | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;
    const f = { patient_id: `eq.${patient.id}` };
    const [vitals, visits, prescriptions, doses, reports, consultations, referrals, alerts] = await Promise.all([
      this.db.select<Row>('vitals', f, { order: 'recorded_at.desc' }),
      this.db.select<Row>('asha_visits', f, { order: 'visited_at.desc' }),
      this.db.select<Row>('prescriptions', f, { order: 'issued_at.desc' }),
      this.db.select<Row>('dose_logs', f, { order: 'scheduled_at.desc', limit: 500 }),
      this.db.select<Row>('health_reports', f, { order: 'created_at.desc' }),
      this.db.select<Row>('consultations', f, { order: 'started_at.desc' }),
      this.db.select<Row>('referrals', f, { order: 'created_at.desc' }),
      this.db.select<Row>('risk_alerts', f, { order: 'created_at.desc' }),
    ]);
    const bundle = {
      patient,
      vitals: vitals.map(mapVitals),
      ashaVisits: visits.map((v) => mapVisit(v, alerts)),
      prescriptions: prescriptions.map(mapPrescription),
      doseLogs: doses.map(mapDose),
      reports: reports.map(mapReport),
      consultations: consultations.map(mapConsultation),
      referrals: referrals.map(mapReferral),
      riskAlerts: alerts.map(mapAlert),
    };
    const ids = new Set<string>();
    for (const v of bundle.ashaVisits) ids.add(v.ashaWorkerId);
    for (const c of bundle.consultations) ids.add(c.doctorId);
    for (const p of bundle.prescriptions) if (p.prescribedBy) ids.add(p.prescribedBy);
    for (const r of bundle.reports) ids.add(r.uploadedBy);
    for (const r of bundle.referrals) ids.add(r.fromAshaId);
    for (const a of bundle.riskAlerts) if (a.ashaWorkerId) ids.add(a.ashaWorkerId);
    const people = ids.size ? (await this.db.select<Row>('profiles', { id: inList([...ids]) }, { columns: 'id,full_name,role' })).map((p) => ({ id: String(p.id), fullName: String(p.full_name), role: p.role as Profile['role'] })) : [];
    return { ...bundle, people };
  }

  async getReferral(id: string) {
    const r = await this.db.selectOne<Row>('referrals', { id: `eq.${toDbId(id)}` });
    return r ? mapReferral(r) : null;
  }

  async savePrescription(p: Prescription) {
    const [r] = await this.db.upsert<Row>('prescriptions', prescriptionRow(p), 'id');
    return mapPrescription(r);
  }

  async saveConsultation(c: Consultation) {
    const [r] = await this.db.upsert<Row>('consultations', consultationRow(c), 'id');
    return mapConsultation(r);
  }

  async saveDoseLog(d: DoseLog) {
    const [r] = await this.db.upsert<Row>('dose_logs', doseRow(d), 'id');
    return mapDose(r);
  }

  async saveVitals(v: VitalsReading) {
    const [r] = await this.db.upsert<Row>('vitals', vitalsRow(v), 'id');
    return mapVitals(r);
  }

  async saveReport(rep: HealthReport) {
    const [r] = await this.db.upsert<Row>('health_reports', reportRow(rep), 'id');
    return mapReport(r);
  }

  async updateReferral(id: string, patch: ReferralPatch) {
    const body: Row = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.seenAt !== undefined) body.seen_at = patch.seenAt;
    if (patch.acceptedAt !== undefined) body.accepted_at = patch.acceptedAt;
    const rows = await this.db.update<Row>('referrals', { id: `eq.${toDbId(id)}` }, body);
    return rows[0] ? mapReferral(rows[0]) : null;
  }

  async registerPatientUser(userId: string, phone: string | null, now: Date) {
    const id = toDbId(userId);
    let profile = await this.getProfile(id);
    if (!profile) {
      const [r] = await this.db.upsert<Row>('profiles', { id, role: 'patient', full_name: newPatientName(phone), phone, is_active: true }, 'id', { ignore: true });
      profile = r ? mapProfile(r) : await this.getProfile(id);
    }
    let patient = await this.findPatientByUser(id);
    if (!patient) {
      const [r] = await this.db.insert<Row>('patients', { user_id: id, full_name: profile!.fullName, phone, created_at: now.toISOString() });
      patient = mapPatient(r);
      await this.db.upsert('patient_consents', { patient_id: patient.id, share_history: false, updated_at: now.toISOString() }, 'patient_id', { ignore: true });
    }
    return { profile: profile!, patient };
  }

  async saveAshaBatch(batch: AshaBatch) {
    const now = new Date().toISOString();
    if (batch.patients.length) {
      await this.db.upsert(
        'patients',
        batch.patients.map((p) => ({
          id: toDbId(p.id),
          full_name: p.name,
          date_of_birth: p.dob ? p.dob.slice(0, 10) : null,
          sex: p.sex === 'F' ? 'female' : p.sex === 'M' ? 'male' : null,
          phone: p.phone ?? null,
          area: p.village ?? null,
          address: p.address ?? null,
          facility_id: DEMO_FACILITY.id,
          asha_worker_id: toDbId(p.assignedAshaId),
          categories: p.categories?.length ? p.categories : ['general'],
          pregnancy: p.pregnancy ?? null,
          newborn: p.newborn ?? null,
          home: p.home ?? null,
          risk_level: p.riskLevel ?? 'none',
          chronic_conditions: p.conditions ?? [],
          updated_at: now,
        })),
        'id',
      );
    }
    if (batch.visits.length) {
      await this.db.upsert(
        'asha_visits',
        batch.visits.map((v) => ({
          id: toDbId(v.id),
          patient_id: toDbId(v.patientId),
          asha_id: toDbId(v.ashaId),
          visited_at: v.visitedAt,
          status: v.status,
          gps: v.gps ?? null,
          vitals: v.vitals ?? null,
          notes: v.notes ?? null,
          photos: v.photos ?? [],
          follow_up_on: v.followUpOn ?? null,
          source: v.source ?? 'manual',
          transcript: v.transcript ?? null,
          updated_at: v.updatedAt ?? now,
        })),
        'id',
      );
      // The server's evaluation replaces whatever was stored for these visits before.
      await this.db.delete('risk_alerts', { visit_id: inList(batch.visits.map((v) => toDbId(v.id))) });
    }
    if (batch.alerts.length) {
      const ashaOf = (a: AshaBatch['alerts'][number]) => batch.visits.find((v) => v.id === a.visitId)?.ashaId ?? batch.referrals.find((r) => r.patientId === a.patientId)?.fromAshaId;
      await this.db.upsert(
        'risk_alerts',
        batch.alerts.map((a) => ({
          id: a.id,
          patient_id: toDbId(a.patientId),
          visit_id: dbIdOrNull(a.visitId),
          asha_id: dbIdOrNull(ashaOf(a)),
          rule_id: a.ruleId,
          severity: a.severity,
          reason: a.reason,
          reason_key: a.reasonKey,
          reason_params: a.reasonParams ?? {},
          evidence: a.evidence ?? [],
          source: a.source,
          verified_by: a.verifiedBy,
          created_at: a.createdAt,
          acknowledged: a.acknowledged === true,
        })),
        'id',
      );
    }
    if (batch.referrals.length) {
      const existing = new Map(
        (await this.db.select<Row>('referrals', { id: inList(batch.referrals.map((r) => toDbId(r.id))) }, { columns: 'id,status,seen_at,accepted_at,to_doctor_id' })).map((r) => [String(r.id), r]),
      );
      await this.db.upsert(
        'referrals',
        batch.referrals.map((r) => {
          const id = toDbId(r.id);
          const old = existing.get(id);
          const seen = r.status === 'pending' ? null : r.updatedAt;
          const accepted = r.status === 'accepted' || r.status === 'closed' ? r.updatedAt : null;
          return {
            id,
            patient_id: toDbId(r.patientId),
            from_asha_id: toDbId(r.fromAshaId),
            to_doctor_id: dbIdOrNull(r.toDoctorId) ?? (old?.to_doctor_id as string | null) ?? null,
            to_facility_id: DEMO_FACILITY.id,
            reason: r.reason,
            risk_alert_id: r.alertIds[0] ?? null,
            alert_ids: r.alertIds,
            urgency: r.urgency,
            status: old ? furtherStatus(old.status as Referral['status'], r.status) : r.status,
            notes: r.notes ?? null,
            created_at: r.createdAt,
            updated_at: r.updatedAt,
            seen_at: (old?.seen_at as string | null) ?? seen,
            accepted_at: (old?.accepted_at as string | null) ?? accepted,
          };
        }),
        'id',
      );
    }
  }

  async listLabResults(patientId: string) {
    const rows = await this.db.select<Row>('lab_results', { patient_id: `eq.${toDbId(patientId)}` }, { order: 'observed_at.asc' });
    return rows.map(mapLabResult);
  }

  async saveLabResults(rows: LabResult[]) {
    if (!rows.length) return [];
    return (await this.db.upsert<Row>('lab_results', rows.map(labResultRow), 'id')).map(mapLabResult);
  }

  async listInbox(doctor: Pick<Profile, 'id' | 'facilityId'>): Promise<DoctorInbox> {
    const or = doctor.facilityId ? `(to_doctor_id.eq.${toDbId(doctor.id)},to_facility_id.eq.${toDbId(doctor.facilityId)})` : `(to_doctor_id.eq.${toDbId(doctor.id)})`;
    const referrals = (await this.db.select<Row>('referrals', { status: 'neq.closed', or }, { order: 'created_at.desc', limit: 200 })).map(mapReferral);
    const ids = [...new Set(referrals.map((r) => r.patientId))];
    if (!ids.length) return { referrals, riskAlerts: [], patients: [] };
    const [alerts, patients] = await Promise.all([
      this.db.select<Row>('risk_alerts', { patient_id: inList(ids), resolved_at: 'is.null' }, { order: 'created_at.desc' }),
      this.db.select<Row>('patients', { id: inList(ids) }),
    ]);
    return { referrals, riskAlerts: alerts.map(mapAlert), patients: patients.map(mapPatient) };
  }
}

export { DbError };
