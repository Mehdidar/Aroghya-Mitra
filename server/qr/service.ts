/**
 * QR health card flows.
 *
 * Patient phone ──(issueQrToken)──▶ token shown as QR, refreshed before expiry
 * Doctor phone  ──(scanQrPayload)─▶ verify → role → consent → single use →
 *                                    grant → history (+ AccessLog), in ONE request,
 *                                    so a scan opens the full history in well under 3 s.
 *
 * Meant to run inside a Supabase Edge Function with the service-role client;
 * the secret comes from the `QR_TOKEN_SECRET` environment variable.
 */
import type { Profile } from '../../features/records/types.ts';
import type { RecordsRepository } from '../records/repository.ts';
import { logAccess, openPatientHistory } from '../records/service.ts';
import type { PatientHistory } from '../records/history.ts';
import { fromQrPayload, signQrToken, toQrPayload, verifyQrToken } from './token.ts';
import type { QrVerifyFailure } from './token.ts';

export interface QrConfig {
  secret: string;
  /** Token lifetime in seconds (5–10 min). */
  ttlSeconds?: number;
  /** How long a successful scan lets the doctor keep viewing the record. */
  grantHours?: number;
  /** The patient app fetches a new token this many seconds before expiry. */
  refreshLeadSeconds?: number;
}

export const DEFAULT_GRANT_HOURS = 12;
export const DEFAULT_REFRESH_LEAD_SECONDS = 60;

export type IssueQrResult =
  | { ok: true; payload: string; expiresAt: string; refreshAt: string; ttlSeconds: number }
  | { ok: false; reason: 'not_permitted' | 'consent_off' };

export async function issueQrToken(
  repo: RecordsRepository,
  viewer: Profile,
  patientId: string,
  config: QrConfig,
  now: Date = new Date(),
): Promise<IssueQrResult> {
  const patient = await repo.getPatient(patientId);
  if (!viewer.isActive || viewer.role !== 'patient' || !patient || patient.userId !== viewer.id) {
    return { ok: false, reason: 'not_permitted' };
  }
  const consent = await repo.getConsent(patientId);
  if (!consent?.shareHistory) return { ok: false, reason: 'consent_off' };

  const { token, claims } = await signQrToken({ patientId, secret: config.secret, ttlSeconds: config.ttlSeconds, now });
  const ttlSeconds = claims.exp - claims.iat;
  const lead = Math.min(config.refreshLeadSeconds ?? DEFAULT_REFRESH_LEAD_SECONDS, Math.floor(ttlSeconds / 2));
  return {
    ok: true,
    payload: toQrPayload(token),
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    refreshAt: new Date((claims.exp - lead) * 1000).toISOString(),
    ttlSeconds,
  };
}

export type ScanDenial =
  | 'not_aroghya_qr'
  | QrVerifyFailure
  | 'forbidden_role'
  | 'inactive_account'
  | 'no_patient'
  | 'consent_off'
  | 'token_already_used'
  | 'not_permitted';

export type ScanResult =
  | { ok: true; patientId: string; grantExpiresAt: string; history: PatientHistory }
  | { ok: false; reason: ScanDenial };

/** User-facing text for each denial, for the scanner screen. */
export const SCAN_DENIAL_MESSAGES: Record<ScanDenial, string> = {
  not_aroghya_qr: 'This is not an Aroghya Mitra health card.',
  malformed: 'The QR code could not be read. Ask the patient to refresh it.',
  bad_header: 'This QR code is not valid.',
  bad_signature: 'This QR code is not valid.',
  wrong_issuer: 'This QR code is not valid.',
  wrong_audience: 'This QR code is not valid.',
  wrong_scope: 'This QR code is not valid.',
  expired: 'This QR code has expired. Ask the patient to open their health card again.',
  not_yet_valid: 'This QR code is not valid yet. Check the phone clock.',
  forbidden_role: 'Only doctors can open a patient history by QR.',
  inactive_account: 'Your account is not active. Contact your facility admin.',
  no_patient: 'Patient not found.',
  consent_off: 'The patient has turned off history sharing.',
  token_already_used: 'This QR code was already used by another doctor. Ask the patient to refresh it.',
  not_permitted: 'You do not have access to this record.',
};

export async function scanQrPayload(
  repo: RecordsRepository,
  viewer: Profile,
  payload: string,
  config: QrConfig,
  now: Date = new Date(),
): Promise<ScanResult> {
  const token = fromQrPayload(payload);
  if (!token) return { ok: false, reason: 'not_aroghya_qr' };

  const verified = await verifyQrToken(token, { secret: config.secret, now });
  if (!verified.ok) {
    // Signature was valid (claims present) → we know which patient; log the failed attempt.
    if (verified.claims && (await repo.getPatient(verified.claims.sub))) {
      await logAccess(repo, viewer, verified.claims.sub, 'qr_scan', 'denied', verified.reason, now);
    }
    return { ok: false, reason: verified.reason };
  }

  const patientId = verified.claims.sub;
  const patient = await repo.getPatient(patientId);
  if (!patient) return { ok: false, reason: 'no_patient' };

  const deny = async (reason: ScanDenial): Promise<ScanResult> => {
    await logAccess(repo, viewer, patientId, 'qr_scan', 'denied', reason, now);
    return { ok: false, reason };
  };

  if (!viewer.isActive) return deny('inactive_account');
  if (viewer.role !== 'doctor') return deny('forbidden_role');

  const consent = await repo.getConsent(patientId);
  if (!consent?.shareHistory) return deny('consent_off');

  const { firstViewerId } = await repo.redeemToken(verified.claims.jti, patientId, viewer.id, now);
  if (firstViewerId !== viewer.id) return deny('token_already_used');

  const grantMs = (config.grantHours ?? DEFAULT_GRANT_HOURS) * 3_600_000;
  const existing = await repo.findActiveGrant(patientId, viewer.id, now);
  const grant =
    existing ??
    (await repo.createGrant({
      patientId,
      viewerId: viewer.id,
      grantedVia: 'qr_scan',
      tokenJti: verified.claims.jti,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + grantMs).toISOString(),
      revokedAt: null,
    }));

  // Logs the 'granted' view itself.
  const opened = await openPatientHistory(repo, viewer, patientId, { method: 'qr_scan', now });
  if (!opened.ok) return { ok: false, reason: opened.reason };
  return { ok: true, patientId, grantExpiresAt: grant.expiresAt, history: opened.history };
}
