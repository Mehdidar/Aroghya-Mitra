import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { authenticate, verifySupabaseJwt } from '../auth.ts';
import { createRouter, json } from '../router.ts';

const SECRET = 'test-secret-at-least-32-bytes-long-ok!!';
const b64 = (s: string | Uint8Array) => Buffer.from(s).toString('base64url');

async function hs256(claims: Record<string, unknown>, secret = SECRET): Promise<string> {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(claims));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}

const withEnv = async (vars: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

describe('verifySupabaseJwt (HS256)', () => {
  it('accepts a valid token and reads the app role from metadata', async () =>
    withEnv({ SUPABASE_JWT_SECRET: SECRET }, async () => {
      const now = Date.now();
      const tok = await hs256({ sub: 'u1', exp: now / 1000 + 60, role: 'authenticated', app_metadata: { role: 'doctor' } });
      const c = await verifySupabaseJwt(tok, fetch, now);
      assert.deepEqual(c, { id: 'u1', role: 'doctor', via: 'jwt' });
    }));

  it('rejects a bad signature, an expired token and garbage', async () =>
    withEnv({ SUPABASE_JWT_SECRET: SECRET }, async () => {
      const now = Date.now();
      assert.equal(await verifySupabaseJwt(await hs256({ sub: 'u1', exp: now / 1000 + 60 }, 'other-secret-that-is-also-long-enough'), fetch, now), null);
      assert.equal(await verifySupabaseJwt(await hs256({ sub: 'u1', exp: now / 1000 - 120 }), fetch, now), null);
      assert.equal(await verifySupabaseJwt('not.a.jwt', fetch, now), null);
      assert.equal(await verifySupabaseJwt(await hs256({ exp: now / 1000 + 60 }), fetch, now), null, 'no sub');
    }));

  it('maps an unknown role to patient', async () =>
    withEnv({ SUPABASE_JWT_SECRET: SECRET }, async () => {
      const tok = await hs256({ sub: 'u2', exp: Date.now() / 1000 + 60, user_metadata: { role: 'superuser' } });
      assert.equal((await verifySupabaseJwt(tok))?.role, 'patient');
    }));
});

describe('authenticate', () => {
  it('supabase mode refuses a request with no token', async () =>
    withEnv({ SUPABASE_JWT_SECRET: SECRET, AUTH_MODE: 'supabase' }, async () => {
      assert.equal(await authenticate(new Request('http://x/qr/issue', { headers: { 'x-demo-role': 'doctor' } })), null);
    }));

  it('demo mode trusts x-demo-role, but still refuses an unknown role', async () =>
    withEnv({ SUPABASE_JWT_SECRET: undefined, SUPABASE_URL: undefined, AUTH_MODE: 'demo' }, async () => {
      const c = await authenticate(new Request('http://x/qr/issue', { headers: { 'x-demo-role': 'asha', 'x-demo-user': 'asha-1' } }));
      assert.deepEqual(c, { id: 'asha-1', role: 'asha', via: 'demo' });
      assert.equal(await authenticate(new Request('http://x/qr/issue', { headers: { 'x-demo-role': 'root' } })), null);
    }));
});

describe('router', () => {
  it('serves /health without auth, 401s protected routes, 404s unknown ones, adds CORS', async () =>
    withEnv({ SUPABASE_JWT_SECRET: SECRET, AUTH_MODE: 'supabase' }, async () => {
      const handler = createRouter([{ method: 'POST', path: '/echo', handler: async (_req, ctx) => json({ who: ctx.caller.id }) }]);
      const health = await handler(new Request('http://x/health'));
      assert.equal(health.status, 200);
      assert.equal(health.headers.get('access-control-allow-origin'), '*');
      assert.equal((await handler(new Request('http://x/echo', { method: 'POST' }))).status, 401);
      assert.equal((await handler(new Request('http://x/nope', { method: 'POST' }))).status, 404);
      const tok = await hs256({ sub: 'u9', exp: Date.now() / 1000 + 60 });
      const ok = await handler(new Request('http://x/echo', { method: 'POST', headers: { authorization: `Bearer ${tok}` } }));
      assert.deepEqual(await ok.json(), { who: 'u9' });
      assert.equal((await handler(new Request('http://x/echo', { method: 'OPTIONS' }))).status, 204);
    }));
});
