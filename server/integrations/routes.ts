/**
 * GET /integrations/status → { ok, checkedAt, integrations: IntegrationStatus[] }
 *
 * Signed-in callers only. Never returns secret values, only variable names.
 * An admin may add ?probe=abdm to try the ABDM sandbox session call once and
 * see whether the credentials work (result: ok / HTTP status, no token).
 */
import { json, type Route } from '../http/router.ts';
import { abdmConfigFromEnv } from './abdm/config.ts';
import { AbdmError, AbdmSession, type Fetch } from './abdm/session.ts';
import { integrationStatus } from './status.ts';

type Read = (name: string) => string | undefined;

export function routes(opts: { read?: Read; fetchImpl?: Fetch } = {}): Route[] {
  return [
    {
      method: 'GET',
      path: '/integrations/status',
      handler: async (_req, { caller, url }) => {
        const integrations = opts.read ? integrationStatus(opts.read) : integrationStatus();
        const body: Record<string, unknown> = { ok: true, checkedAt: new Date().toISOString(), integrations };
        if (url.searchParams.get('probe') === 'abdm') {
          if (caller.role !== 'admin') return json({ error: 'Only an admin can probe integrations' }, 403);
          const { config } = opts.read ? abdmConfigFromEnv(opts.read) : abdmConfigFromEnv();
          if (!config) body.probe = { abdm: { ok: false, reason: 'not_configured' } };
          else {
            try {
              await new AbdmSession(config, opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}).accessToken();
              body.probe = { abdm: { ok: true } };
            } catch (e) {
              body.probe = { abdm: { ok: false, status: e instanceof AbdmError ? e.status : 0, reason: e instanceof AbdmError ? e.message : 'error' } };
            }
          }
        }
        return json(body, 200, { 'cache-control': 'no-store' });
      },
    },
  ];
}
