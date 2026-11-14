import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { routes } from '../routes.ts';
import { integrationStatus } from '../status.ts';

const SECRET = 'super-secret-abdm-value';
const CONFIGURED = { ABDM_CLIENT_ID: 'TEST_CLIENT', ABDM_CLIENT_SECRET: SECRET, ABDM_BASE_URL: 'https://abdm.test.invalid/api/hiecm' } as Record<string, string>;
const read = (o: Record<string, string>) => (k: string) => o[k];

async function get(opts: Parameters<typeof routes>[0], role: 'patient' | 'admin', qs = '') {
  const [route] = routes(opts);
  const url = new URL(`http://localhost/integrations/status${qs}`);
  const res = await route.handler(new Request(url), { caller: { id: 'u1', role, via: 'demo' }, url });
  return { status: res.status, text: await res.text() };
}

describe('integration status', () => {
  it('lists every system once, with ABDM disabled when unset', () => {
    const s = integrationStatus(read({}));
    assert.deepEqual(s.map((x) => x.id), ['abdm', 'esanjeevani', 'eraktkosh', 'jan_aushadhi', 'uwin', 'digilocker']);
    const abdm = s[0];
    assert.equal(abdm.state, 'disabled');
    assert.deepEqual(abdm.missingEnv, ['ABDM_CLIENT_ID', 'ABDM_CLIENT_SECRET', 'ABDM_BASE_URL']);
    assert.equal(s.find((x) => x.id === 'eraktkosh')?.verdict, 'no_public_api');
  });

  it('reports ABDM enabled when configured and never echoes values', async () => {
    const r = await get({ read: read(CONFIGURED) }, 'patient');
    assert.equal(r.status, 200);
    const body = JSON.parse(r.text);
    assert.equal(body.integrations[0].state, 'enabled');
    assert.doesNotMatch(r.text, new RegExp(SECRET));
    assert.doesNotMatch(r.text, /TEST_CLIENT|abdm\.test\.invalid/);
  });

  it('lets only an admin probe ABDM, using the injected fake fetch', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ accessToken: 'tok' }), { status: 200 });
    }) as unknown as typeof fetch;
    assert.equal((await get({ read: read(CONFIGURED), fetchImpl }, 'patient', '?probe=abdm')).status, 403);
    const r = await get({ read: read(CONFIGURED), fetchImpl }, 'admin', '?probe=abdm');
    assert.deepEqual(JSON.parse(r.text).probe, { abdm: { ok: true } });
    assert.deepEqual(calls, ['https://abdm.test.invalid/api/hiecm/gateway/v3/sessions']);
    assert.doesNotMatch(r.text, /tok"|super-secret/);
    const off = await get({ read: read({}), fetchImpl }, 'admin', '?probe=abdm');
    assert.deepEqual(JSON.parse(off.text).probe, { abdm: { ok: false, reason: 'not_configured' } });
  });
});
