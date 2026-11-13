import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_IDS } from '../../../packages/shared/demo.ts';
import { createRouter } from '../../http/router.ts';
import { demoMemoryData } from '../demoSeed.ts';
import { MemoryRecordsRepository } from '../memoryRepository.ts';
import { routes } from '../routes.ts';

const SECRET = 'test-secret-at-least-32-characters-long!!';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function jwt(claims: Record<string, unknown>): Promise<string> {
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 600, ...claims })}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(head))).toString('base64url');
  return `${head}.${sig}`;
}

async function withJwtAuth(fn: () => Promise<void>) {
  const prev = { mode: process.env.AUTH_MODE, sec: process.env.SUPABASE_JWT_SECRET, url: process.env.SUPABASE_URL };
  process.env.AUTH_MODE = 'supabase';
  process.env.SUPABASE_JWT_SECRET = SECRET;
  delete process.env.SUPABASE_URL;
  try {
    await fn();
  } finally {
    for (const [k, v] of [['AUTH_MODE', prev.mode], ['SUPABASE_JWT_SECRET', prev.sec], ['SUPABASE_URL', prev.url]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const me = async (handler: (r: Request) => Promise<Response>, token: string) => {
  const res = await handler(new Request('http://x/me', { headers: { authorization: `Bearer ${token}` } }));
  return { status: res.status, body: (await res.json()) as { role: string; patientId: string | null; fullName: string; id: string } };
};

describe('GET /me', () => {
  it('a first-time patient gets a profile and an empty record, once', () =>
    withJwtAuth(async () => {
      const repo = new MemoryRecordsRepository(demoMemoryData());
      const handler = createRouter(routes({ repo }));
      const token = await jwt({ sub: 'aaaaaaaa-0000-4000-8000-000000000001', phone: '919812345678' });
      const first = await me(handler, token);
      assert.equal(first.status, 200);
      assert.equal(first.body.role, 'patient');
      assert.ok(first.body.patientId);
      assert.equal(first.body.fullName, 'Patient 5678');
      const again = await me(handler, token);
      assert.equal(again.body.patientId, first.body.patientId);
      assert.equal(repo.data.patients.filter((p) => p.userId === 'aaaaaaaa-0000-4000-8000-000000000001').length, 1);
      const bundle = await repo.loadRecordBundle(first.body.patientId!);
      assert.equal(bundle?.prescriptions.length, 0, 'a new patient does not see anyone else\'s records');
    }));

  it('a role in user_metadata (which users can set themselves) is ignored', () =>
    withJwtAuth(async () => {
      const handler = createRouter(routes({ repo: new MemoryRecordsRepository(demoMemoryData()) }));
      const r = await me(handler, await jwt({ sub: 'bbbbbbbb-0000-4000-8000-000000000001', user_metadata: { role: 'doctor' } }));
      assert.equal(r.body.role, 'patient');
    }));

  it('staff roles come from app_metadata and the profile, and the demo doctor resolves to Dr. Rao', () =>
    withJwtAuth(async () => {
      const handler = createRouter(routes({ repo: new MemoryRecordsRepository(demoMemoryData()) }));
      const r = await me(handler, await jwt({ sub: DEMO_IDS.doctor, app_metadata: { role: 'doctor' } }));
      assert.equal(r.body.role, 'doctor');
      assert.equal(r.body.fullName, 'Dr. Arjun Rao');
      assert.equal(r.body.patientId, null);
    }));
});
