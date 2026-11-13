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
import { openPatientHistory } from './service.ts';

const HISTORY = /^\/records\/history\/([^/]+)$/;

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
  ];
}
