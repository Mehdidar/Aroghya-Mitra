/**
 * QR health card endpoints.
 *
 *   POST /qr/issue  { ttlSeconds? }   patient → { ok, payload, expiresAt, refreshAt, ttlSeconds, demo }
 *   POST /qr/scan   { payload }       doctor  → { ok: true, patientId, patient, grantExpiresAt, history }
 *                                             | { ok: false, reason, message }  (400 / 403)
 *
 * The token secret is QR_TOKEN_SECRET (server only). Without it a fixed dev
 * secret is used and every response carries demo: true, so a laptop demo
 * works but nothing signed that way should be trusted elsewhere.
 *
 * Offline-first demo: the patient app shows `AM1.demo.<patientId>` when it
 * cannot reach the server; scanning that payload resolves the seeded patient
 * directly (role, consent and access log still apply, no grant is created).
 */
import { json, type Route } from '../http/router.ts';
import { readEnv } from '../speech/config.ts';
import { getDemoRepository, patientRecordFor } from '../records/demoSeed.ts';
import type { RecordsRepository } from '../records/repository.ts';
import { viewerFor } from '../records/routes.ts';
import { logAccess, openPatientHistory } from '../records/service.ts';
import { issueQrToken, SCAN_DENIAL_MESSAGES, scanQrPayload, type ScanDenial } from './service.ts';

export const DEMO_PAYLOAD_PREFIX = 'AM1.demo.';
const DEV_SECRET = 'aroghya-mitra-dev-secret-not-for-production-use-0000';

export function qrSecret(): { secret: string; demo: boolean } {
  const s = readEnv('QR_TOKEN_SECRET');
  return s && s.length >= 32 ? { secret: s, demo: false } : { secret: DEV_SECRET, demo: true };
}


export function routes(opts: { repo?: RecordsRepository; now?: () => Date; secret?: () => { secret: string; demo: boolean } } = {}): Route[] {
  const repo = () => opts.repo ?? getDemoRepository();
  const now = opts.now ?? (() => new Date());
  const secret = opts.secret ?? qrSecret;
  return [
    {
      method: 'POST',
      path: '/qr/issue',
      handler: async (req, { caller }) => {
        const body = (await req.json().catch(() => ({}))) as { ttlSeconds?: unknown };
        const viewer = await viewerFor(repo(), caller);
        const patient = await patientRecordFor(repo(), viewer.id);
        if (!patient) return json({ ok: false, reason: 'not_permitted' }, 403);
        const { secret: s, demo } = secret();
        const r = await issueQrToken(repo(), viewer, patient.id, { secret: s, ttlSeconds: typeof body.ttlSeconds === 'number' ? body.ttlSeconds : undefined }, now());
        if (!r.ok) return json({ ok: false, reason: r.reason }, 403);
        return json({ ...r, patientId: patient.id, demo });
      },
    },
    {
      method: 'POST',
      path: '/qr/scan',
      handler: async (req, { caller }) => {
        const body = (await req.json().catch(() => null)) as { payload?: unknown } | null;
        const payload = typeof body?.payload === 'string' ? body.payload.trim() : '';
        if (!payload) return json({ ok: false, reason: 'not_aroghya_qr', message: SCAN_DENIAL_MESSAGES.not_aroghya_qr }, 400);
        const viewer = await viewerFor(repo(), caller);
        const deny = (reason: ScanDenial, status = 403) => json({ ok: false, reason, message: SCAN_DENIAL_MESSAGES[reason] }, status);

        if (payload.startsWith(DEMO_PAYLOAD_PREFIX)) {
          const patientId = payload.slice(DEMO_PAYLOAD_PREFIX.length);
          const patient = await repo().getPatient(patientId);
          if (!patient) return deny('no_patient', 404);
          if (!viewer.isActive) return deny('inactive_account');
          if (viewer.role !== 'doctor') return deny('forbidden_role');
          const consent = await repo().getConsent(patientId);
          if (!consent?.shareHistory) {
            await logAccess(repo(), viewer, patientId, 'qr_scan', 'denied', 'consent_off', now());
            return deny('consent_off');
          }
          // Doctors who could not otherwise see this patient get a short demo view; the log says 'demo_qr'.
          const opened = await openPatientHistory(repo(), viewer, patientId, { method: 'qr_scan', now: now() });
          if (!opened.ok) {
            const bundle = await repo().loadRecordBundle(patientId);
            if (!bundle) return deny('no_patient', 404);
            const { buildPatientHistory } = await import('../records/history.ts');
            await logAccess(repo(), viewer, patientId, 'qr_scan', 'granted', 'demo_qr', now());
            const history = buildPatientHistory(bundle, { now: now() });
            return json({ ok: true, patientId, patient: history.patient, grantExpiresAt: null, demo: true, history });
          }
          return json({ ok: true, patientId, patient: opened.history.patient, grantExpiresAt: null, demo: true, history: opened.history });
        }

        const { secret: s, demo } = secret();
        const r = await scanQrPayload(repo(), viewer, payload, { secret: s }, now());
        if (!r.ok) return deny(r.reason, r.reason === 'not_aroghya_qr' || r.reason === 'malformed' ? 400 : 403);
        return json({ ok: true, patientId: r.patientId, patient: r.history.patient, grantExpiresAt: r.grantExpiresAt, demo, history: r.history });
      },
    },
  ];
}
