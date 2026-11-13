/**
 * Writes from the phones, and the raw records they merge back.
 *
 *   POST /records/push        { prescriptions?, consultations?, doseLogs?, vitals?, reports?, referrals?, consent? }
 *                             → { ok: true, saved: {...counts}, rejected: [{ kind, id, reason }] }
 *   GET  /records/bundle/:id  → { ok: true, bundle } with the same access rules as /records/history
 *
 * The service-role database client bypasses RLS, so every row is checked here
 * against the same rules the RLS policies enforce:
 *  - patient: their own record only; dose logs, vitals they took, scanned
 *    prescriptions, their reports, their "Share history" switch
 *  - doctor:  only patients they may open (access.ts); prescriptions and
 *    consultations in their own name; referrals addressed to them or their facility
 *  - asha / admin: nothing here (ASHA data goes through /asha/sync)
 * One bad row is rejected on its own; the rest of the batch is still saved.
 */
import type {
  Consultation,
  DoseLog,
  HealthReport,
  Prescription,
  Profile,
  Referral,
  VitalsReading,
} from '../../packages/records/records/types.ts';
import { sameRecord } from '../../packages/shared/ids.ts';
import { resolveAccess } from './access.ts';
import type { RecordsRepository, ReferralPatch } from './repository.ts';
import { setShareHistory } from './service.ts';

export type PushKind = 'prescriptions' | 'consultations' | 'doseLogs' | 'vitals' | 'reports' | 'referrals' | 'consent';

export interface PushRequest {
  prescriptions?: Prescription[];
  consultations?: Consultation[];
  doseLogs?: DoseLog[];
  vitals?: VitalsReading[];
  reports?: HealthReport[];
  referrals?: ({ id: string } & ReferralPatch)[];
  consent?: { patientId: string; shareHistory: boolean };
}

export interface PushResult {
  ok: true;
  saved: Record<PushKind, number>;
  rejected: { kind: PushKind; id: string; reason: string }[];
}

export const MAX_PUSH_ROWS = 500;
const REFERRAL_STATUSES = new Set(['pending', 'seen', 'accepted', 'closed']);
const DOSE_STATUSES = new Set(['taken', 'missed', 'skipped', 'pending']);

export class PushError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const hasId = (r: unknown): r is { id: string; patientId: string } =>
  !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' && typeof (r as { patientId?: unknown }).patientId === 'string';

export async function push(repo: RecordsRepository, viewer: Profile, body: unknown, now = new Date()): Promise<PushResult> {
  if (!body || typeof body !== 'object') throw new PushError(400, 'Expected a JSON object');
  if (!viewer.isActive) throw new PushError(403, 'Account is not active');
  if (viewer.role !== 'patient' && viewer.role !== 'doctor') throw new PushError(403, 'Only patients and doctors write records here');
  const req = body as PushRequest;
  const lists = ['prescriptions', 'consultations', 'doseLogs', 'vitals', 'reports', 'referrals'] as const;
  let total = 0;
  for (const k of lists) {
    const v = req[k];
    if (v !== undefined && !Array.isArray(v)) throw new PushError(400, `${k} must be an array`);
    total += v?.length ?? 0;
  }
  if (total > MAX_PUSH_ROWS) throw new PushError(413, `At most ${MAX_PUSH_ROWS} records per push`);

  const result: PushResult = { ok: true, saved: { prescriptions: 0, consultations: 0, doseLogs: 0, vitals: 0, reports: 0, referrals: 0, consent: 0 }, rejected: [] };
  const reject = (kind: PushKind, id: string, reason: string) => result.rejected.push({ kind, id, reason });

  // Access is per patient; cache the decision for the batch.
  const access = new Map<string, Promise<boolean>>();
  const mayWrite = (patientId: string) => {
    if (!access.has(patientId)) access.set(patientId, resolveAccess(repo, viewer, patientId, now).then((d) => d.allowed));
    return access.get(patientId)!;
  };
  const isPatient = viewer.role === 'patient';
  const isDoctor = viewer.role === 'doctor';

  for (const p of req.prescriptions ?? []) {
    if (!hasId(p) || !Array.isArray(p.items)) { reject('prescriptions', String((p as { id?: unknown })?.id), 'malformed'); continue; }
    if (!(await mayWrite(p.patientId))) { reject('prescriptions', p.id, 'not_permitted'); continue; }
    if (isDoctor && (p.source !== 'doctor' || !p.prescribedBy || !sameRecord(p.prescribedBy, viewer.id))) { reject('prescriptions', p.id, 'must_be_prescribed_by_you'); continue; }
    if (isPatient && (p.source !== 'scan' || p.prescribedBy !== null)) { reject('prescriptions', p.id, 'patients_add_scanned_only'); continue; }
    await repo.savePrescription(p);
    result.saved.prescriptions++;
  }

  for (const c of req.consultations ?? []) {
    if (!hasId(c)) { reject('consultations', String((c as { id?: unknown })?.id), 'malformed'); continue; }
    if (!isDoctor || !sameRecord(c.doctorId, viewer.id)) { reject('consultations', c.id, 'doctor_only'); continue; }
    if (!(await mayWrite(c.patientId))) { reject('consultations', c.id, 'not_permitted'); continue; }
    await repo.saveConsultation(c);
    result.saved.consultations++;
  }

  for (const d of req.doseLogs ?? []) {
    if (!hasId(d) || !DOSE_STATUSES.has(d.status)) { reject('doseLogs', String((d as { id?: unknown })?.id), 'malformed'); continue; }
    if (!isPatient || !(await mayWrite(d.patientId))) { reject('doseLogs', d.id, 'not_permitted'); continue; }
    await repo.saveDoseLog(d);
    result.saved.doseLogs++;
  }

  for (const v of req.vitals ?? []) {
    if (!hasId(v)) { reject('vitals', String((v as { id?: unknown })?.id), 'malformed'); continue; }
    if (!(await mayWrite(v.patientId))) { reject('vitals', v.id, 'not_permitted'); continue; }
    const expectedSource = isPatient ? ['self', 'device'] : ['consultation'];
    if (!expectedSource.includes(v.source) || (v.recordedBy && !sameRecord(v.recordedBy, viewer.id))) { reject('vitals', v.id, 'wrong_source'); continue; }
    await repo.saveVitals({ ...v, recordedBy: viewer.id });
    result.saved.vitals++;
  }

  for (const r of req.reports ?? []) {
    if (!hasId(r)) { reject('reports', String((r as { id?: unknown })?.id), 'malformed'); continue; }
    if (!(await mayWrite(r.patientId))) { reject('reports', r.id, 'not_permitted'); continue; }
    if (!sameRecord(r.uploadedBy, viewer.id)) { reject('reports', r.id, 'must_be_uploaded_by_you'); continue; }
    await repo.saveReport(r);
    result.saved.reports++;
  }

  for (const u of req.referrals ?? []) {
    if (!u || typeof u.id !== 'string') { reject('referrals', String(u?.id), 'malformed'); continue; }
    if (!isDoctor) { reject('referrals', u.id, 'doctor_only'); continue; }
    if (u.status !== undefined && !REFERRAL_STATUSES.has(u.status)) { reject('referrals', u.id, 'malformed'); continue; }
    const ref: Referral | null = await repo.getReferral(u.id);
    if (!ref) { reject('referrals', u.id, 'not_found'); continue; }
    const addressedToMe = (ref.toDoctorId && sameRecord(ref.toDoctorId, viewer.id)) || (ref.toFacilityId && viewer.facilityId && sameRecord(ref.toFacilityId, viewer.facilityId));
    if (!addressedToMe) { reject('referrals', u.id, 'not_addressed_to_you'); continue; }
    await repo.updateReferral(u.id, { status: u.status, seenAt: u.seenAt, acceptedAt: u.acceptedAt });
    result.saved.referrals++;
  }

  if (req.consent) {
    const r = await setShareHistory(repo, viewer, req.consent.patientId, req.consent.shareHistory === true, now);
    if (r.ok) result.saved.consent = 1;
    else reject('consent', req.consent.patientId, r.reason);
  }

  return result;
}
