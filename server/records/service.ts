/**
 * Server-side entry points for health records. Every attempt to open a
 * history (granted or denied) writes one AccessLog row; there is no code
 * path that returns a history without logging it.
 */
import type { AccessLog, AccessMethod, PatientConsent, Profile } from '../../features/records/types.ts';
import { resolveAccess } from './access.ts';
import type { AccessBasis, AccessDenial } from './access.ts';
import { buildPatientHistory } from './history.ts';
import type { PatientHistory } from './history.ts';
import type { RecordsRepository } from './repository.ts';

export type OpenHistoryResult =
  | { ok: true; basis: AccessBasis; history: PatientHistory; log: AccessLog }
  | { ok: false; reason: AccessDenial };

export async function openPatientHistory(
  repo: RecordsRepository,
  viewer: Profile,
  patientId: string,
  opts: { method?: AccessMethod; now?: Date } = {},
): Promise<OpenHistoryResult> {
  const now = opts.now ?? new Date();
  const method = opts.method ?? 'direct';
  const decision = await resolveAccess(repo, viewer, patientId, now);

  if (!decision.allowed) {
    if (decision.reason !== 'no_patient') {
      await logAccess(repo, viewer, patientId, method, 'denied', decision.reason, now);
    }
    return { ok: false, reason: decision.reason };
  }

  const bundle = await repo.loadRecordBundle(patientId);
  if (!bundle) return { ok: false, reason: 'no_patient' };
  const log = await logAccess(repo, viewer, patientId, method, 'granted', decision.basis, now);
  return { ok: true, basis: decision.basis, history: buildPatientHistory(bundle, { now }), log };
}

/** The patient's "Share history" toggle. Turning it off revokes every QR grant at once. */
export async function setShareHistory(
  repo: RecordsRepository,
  viewer: Profile,
  patientId: string,
  shareHistory: boolean,
  now: Date = new Date(),
): Promise<{ ok: true; consent: PatientConsent; revokedGrants: number } | { ok: false; reason: 'not_permitted' }> {
  const patient = await repo.getPatient(patientId);
  if (!viewer.isActive || viewer.role !== 'patient' || !patient || patient.userId !== viewer.id) {
    return { ok: false, reason: 'not_permitted' };
  }
  const consent = await repo.setConsent(patientId, shareHistory, now);
  const revokedGrants = shareHistory ? 0 : await repo.revokeGrants(patientId, now);
  return { ok: true, consent, revokedGrants };
}

/** "Who viewed my record": the patient themself, or an admin of the patient's facility. */
export async function listAccessLog(
  repo: RecordsRepository,
  viewer: Profile,
  patientId: string,
  limit = 50,
): Promise<{ ok: true; entries: AccessLog[] } | { ok: false; reason: 'not_permitted' }> {
  const patient = await repo.getPatient(patientId);
  const allowed =
    viewer.isActive &&
    patient !== null &&
    ((viewer.role === 'patient' && patient.userId === viewer.id) ||
      (viewer.role === 'admin' && patient.facilityId !== null && patient.facilityId === viewer.facilityId));
  if (!allowed) return { ok: false, reason: 'not_permitted' };
  return { ok: true, entries: await repo.listAccessLogs(patientId, Math.min(Math.max(limit, 1), 200)) };
}

export function logAccess(
  repo: RecordsRepository,
  viewer: Profile,
  patientId: string,
  method: AccessMethod,
  outcome: AccessLog['outcome'],
  reason: string | null,
  now: Date,
): Promise<AccessLog> {
  return repo.insertAccessLog({
    patientId,
    viewerId: viewer.id,
    viewerRole: viewer.role,
    viewerName: viewer.fullName,
    method,
    outcome,
    reason,
    createdAt: now.toISOString(),
  });
}
