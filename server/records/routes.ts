/**
 * GET /records/history/:patientId  → { ok: true, basis, history } | 403 { ok: false, reason }
 *
 * Access follows server/records/access.ts (patient: own record; doctor:
 * facility, open referral or a valid QR grant; admin: facility). Every open,
 * granted or denied, writes an access log through openPatientHistory.
 */
import { json, type Route } from '../http/router.ts';
import type { Caller } from '../http/auth.ts';
import type { Profile } from '../../packages/shared/types.ts';
import { getDemoRepository, resolveCallerId } from './demoSeed.ts';
import type { RecordsRepository } from './repository.ts';
import { PushError, push } from './push.ts';
import { logAccess, openPatientHistory } from './service.ts';
import { resolveAccess } from './access.ts';

const HISTORY = /^\/records\/history\/([^/]+)$/;
const BUNDLE = /^\/records\/bundle\/([^/]+)$/;

/** The caller as a Profile. Unknown ids (not in the repository) get an inactive profile, so they can open nothing. */
export async function viewerFor(repo: RecordsRepository, caller: Caller): Promise<Profile> {
  const id = resolveCallerId(caller.id, caller.role);
  return (await repo.getProfile(id)) ?? { id, role: caller.role, fullName: caller.id, facilityId: null, isActive: caller.via === 'jwt' };
}

export function routes(opts: { repo?: RecordsRepository; now?: () => Date } = {}): Route[] {
  const repo = () => opts.repo ?? getDemoRepository();
  const now = opts.now ?? (() => new Date());
  return [
    {
      method: 'GET',
      path: HISTORY,
      handler: async (_req, { caller, url }) => {
        const patientId = decodeURIComponent(HISTORY.exec(url.pathname.replace(/\/+$/, ''))?.[1] ?? '');
        const viewer = await viewerFor(repo(), caller);
        const r = await openPatientHistory(repo(), viewer, patientId, { method: 'direct', now: now() });
        if (!r.ok) return json({ ok: false, reason: r.reason }, r.reason === 'no_patient' ? 404 : 403);
        return json({ ok: true, basis: r.basis, history: r.history });
      },
    },
    {
      method: 'GET',
      path: BUNDLE,
      handler: async (_req, { caller, url }) => {
        const patientId = decodeURIComponent(BUNDLE.exec(url.pathname.replace(/\/+$/, ''))?.[1] ?? '');
        const viewer = await viewerFor(repo(), caller);
        const t = now();
        const d = await resolveAccess(repo(), viewer, patientId, t);
        if (!d.allowed) {
          if (d.reason !== 'no_patient') await logAccess(repo(), viewer, patientId, 'direct', 'denied', d.reason, t);
          return json({ ok: false, reason: d.reason }, d.reason === 'no_patient' ? 404 : 403);
        }
        const bundle = await repo().loadRecordBundle(patientId);
        if (!bundle) return json({ ok: false, reason: 'no_patient' }, 404);
        // The patient's own phone refreshing itself is not logged as a "view"; anyone else is.
        if (d.basis !== 'self') await logAccess(repo(), viewer, patientId, 'direct', 'granted', d.basis, t);
        return json({ ok: true, basis: d.basis, bundle });
      },
    },
    {
      method: 'GET',
      path: '/records/inbox',
      handler: async (_req, { caller }) => {
        const viewer = await viewerFor(repo(), caller);
        if (!viewer.isActive || (viewer.role !== 'doctor' && viewer.role !== 'admin')) return json({ ok: false, reason: 'not_permitted' }, 403);
        return json({ ok: true, ...(await repo().listInbox(viewer)) });
      },
    },
    {
      method: 'POST',
      path: '/records/push',
      handler: async (req, { caller }) => {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: 'Expected a JSON body' }, 400);
        try {
          return json(await push(repo(), await viewerFor(repo(), caller), body, now()));
        } catch (e) {
          if (e instanceof PushError) return json({ error: e.message }, e.status);
          throw e;
        }
      },
    },
  ];
}
