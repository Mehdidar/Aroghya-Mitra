import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { abdmConfigFromEnv, type AbdmConfig } from '../config.ts';
import { AbdmError, AbdmSession } from '../session.ts';

// Fake credentials and a fake fetch: these tests never reach a real ABDM endpoint.
const CONFIG: AbdmConfig = { clientId: 'TEST_CLIENT', clientSecret: 'test-secret-value', baseUrl: 'https://abdm.test.invalid/api/hiecm', cmId: 'sbx' };
const env = (o: Record<string, string>) => (k: string) => o[k];

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('ABDM config', () => {
  it('is disabled and names the missing variables when nothing is set', () => {
    const r = abdmConfigFromEnv(env({}));
    assert.equal(r.config, null);
    assert.deepEqual(r.missing, ['ABDM_CLIENT_ID', 'ABDM_CLIENT_SECRET', 'ABDM_BASE_URL']);
  });

  it('builds a sandbox config with X-CM-ID sbx by default', () => {
    const r = abdmConfigFromEnv(env({ ABDM_CLIENT_ID: 'a', ABDM_CLIENT_SECRET: 'b', ABDM_BASE_URL: 'https://dev.abdm.gov.in/api/hiecm/' }));
    assert.deepEqual(r.config, { clientId: 'a', clientSecret: 'b', baseUrl: 'https://dev.abdm.gov.in/api/hiecm', cmId: 'sbx' });
  });

  it('refuses the production gateway, the production CM id and plain http', () => {
    const base = { ABDM_CLIENT_ID: 'a', ABDM_CLIENT_SECRET: 'b' };
    assert.match(abdmConfigFromEnv(env({ ...base, ABDM_BASE_URL: 'https://apis.abdm.gov.in/api/hiecm' })).problem ?? '', /production/);
    assert.match(abdmConfigFromEnv(env({ ...base, ABDM_BASE_URL: 'https://dev.abdm.gov.in/api/hiecm', ABDM_CM_ID: 'abdm' })).problem ?? '', /production/);
    assert.match(abdmConfigFromEnv(env({ ...base, ABDM_BASE_URL: 'http://dev.abdm.gov.in/api/hiecm' })).problem ?? '', /https/);
    assert.ok(abdmConfigFromEnv(env({ ...base, ABDM_BASE_URL: 'http://localhost:8090' })).config, 'a local mock gateway is allowed');
  });
});

describe('ABDM session', () => {
  it('posts client credentials to /gateway/v3/sessions with the gateway headers', async () => {
    const f = fakeFetch([{ status: 200, body: { accessToken: 'tok-1', expiresIn: 1200, tokenType: 'bearer' } }]);
    const s = new AbdmSession(CONFIG, { fetchImpl: f.fn, now: () => Date.parse('2026-11-14T10:00:00.000Z'), requestId: () => 'req-1' });
    assert.equal(await s.accessToken(), 'tok-1');
    assert.equal(f.calls.length, 1);
    const { url, init } = f.calls[0];
    assert.equal(url, 'https://abdm.test.invalid/api/hiecm/gateway/v3/sessions');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(String(init.body)), { clientId: 'TEST_CLIENT', clientSecret: 'test-secret-value', grantType: 'client_credentials' });
    const h = init.headers as Record<string, string>;
    assert.equal(h['x-cm-id'], 'sbx');
    assert.equal(h['request-id'], 'req-1');
    assert.equal(h.timestamp, '2026-11-14T10:00:00.000Z');
    assert.equal(h['content-type'], 'application/json');
  });

  it('reuses the token, shares concurrent fetches, and refreshes after at most 15 minutes', async () => {
    let t = 0;
    const f = fakeFetch([{ status: 200, body: { accessToken: 'tok-1', expiresIn: 1800 } }, { status: 200, body: { accessToken: 'tok-2', expiresIn: 1800 } }]);
    const s = new AbdmSession(CONFIG, { fetchImpl: f.fn, now: () => t });
    const [a, b] = await Promise.all([s.accessToken(), s.accessToken()]);
    assert.deepEqual([a, b, f.calls.length], ['tok-1', 'tok-1', 1]);
    t = 14 * 60 * 1000;
    assert.equal(await s.accessToken(), 'tok-1');
    t = 15 * 60 * 1000 + 1;
    assert.equal(await s.accessToken(), 'tok-2');
    assert.equal(f.calls.length, 2);
    const h = await s.gatewayHeaders();
    assert.equal(h.authorization, 'Bearer tok-2');
  });

  it('honours a short expiresIn with a safety margin', async () => {
    let t = 0;
    const f = fakeFetch([{ status: 200, body: { accessToken: 'short', expiresIn: 120 } }, { status: 200, body: { accessToken: 'next' } }]);
    const s = new AbdmSession(CONFIG, { fetchImpl: f.fn, now: () => t });
    await s.accessToken();
    t = 61 * 1000;
    assert.equal(await s.accessToken(), 'next');
  });

  it('reports bad credentials and bad responses without leaking the secret', async () => {
    for (const [status, body, re] of [
      [401, { error: 'unauthorized' }, /client id or secret/],
      [500, 'oops', /HTTP 500/],
      [200, 'not json', /not JSON/],
      [200, { tokenType: 'bearer' }, /no accessToken/],
    ] as const) {
      const s = new AbdmSession(CONFIG, { fetchImpl: fakeFetch([{ status, body }]).fn });
      await assert.rejects(s.accessToken(), (e: unknown) => {
        assert.ok(e instanceof AbdmError);
        assert.match(e.message, re);
        assert.doesNotMatch(e.message, /test-secret-value/);
        return true;
      });
    }
  });

  it('turns a network failure into an AbdmError with status 0', async () => {
    const fn = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await assert.rejects(new AbdmSession(CONFIG, { fetchImpl: fn }).accessToken(), (e: unknown) => e instanceof AbdmError && e.status === 0);
  });
});
