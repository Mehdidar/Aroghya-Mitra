import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_IDS } from '../../../packages/shared/demo.ts';
import { createRouter } from '../../http/router.ts';
import { demoMemoryData } from '../../records/demoSeed.ts';
import { MemoryRecordsRepository } from '../../records/memoryRepository.ts';
import { DEMO_PAYLOAD_PREFIX, routes } from '../routes.ts';
import { signQrToken, toQrPayload } from '../token.ts';

const SECRET = 'unit-test-secret-that-is-long-enough-for-hmac-32';

const withDemoAuth = async (fn: () => Promise<void>) => {
  const prev = { mode: process.env.AUTH_MODE, url: process.env.SUPABASE_URL, sec: process.env.SUPABASE_JWT_SECRET };
  process.env.AUTH_MODE = 'demo';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_JWT_SECRET;
  try {
    await fn();
  } finally {
    if (prev.mode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = prev.mode;
    if (prev.url !== undefined) process.env.SUPABASE_URL = prev.url;
    if (prev.sec !== undefined) process.env.SUPABASE_JWT_SECRET = prev.sec;
  }
};

function setup() {
  const repo = new MemoryRecordsRepository(demoMemoryData());
  const handler = createRouter(routes({ repo, secret: () => ({ secret: SECRET, demo: false }) }));
  const post = (path: string, body: unknown, role: string, user?: string) =>
    handler(new Request(`http://x${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-role': role, ...(user ? { 'x-demo-user': user } : {}) }, body: JSON.stringify(body) }));
  return { repo, handler, post };
}

describe('POST /qr/issue', () => {
  it('issues a payload for the signed-in patient with refresh before expiry', () =>
    withDemoAuth(async () => {
      const { post } = setup();
      const res = await post('/qr/issue', {}, 'patient', DEMO_IDS.patient);
      assert.equal(res.status, 200);
      const b = (await res.json()) as { ok: boolean; payload: string; expiresAt: string; refreshAt: string; ttlSeconds: number; demo: boolean; patientId: string };
      assert.equal(b.ok, true);
      assert.ok(b.payload.startsWith('AM1.'));
      assert.ok(Date.parse(b.refreshAt) < Date.parse(b.expiresAt));
      assert.equal(b.patientId, DEMO_IDS.patientRecord);
      assert.equal(b.demo, false);
    }));

  it('a doctor cannot issue one; consent off blocks it', () =>
    withDemoAuth(async () => {
      const { post, repo } = setup();
      assert.equal((await post('/qr/issue', {}, 'doctor', DEMO_IDS.doctor)).status, 403);
      await repo.setConsent(DEMO_IDS.patientRecord, false, new Date());
      const off = await post('/qr/issue', {}, 'patient', DEMO_IDS.patient);
      assert.equal(off.status, 403);
      assert.equal(((await off.json()) as { reason: string }).reason, 'consent_off');
    }));
});

describe('POST /qr/scan', () => {
  it('a doctor scans a valid token and gets the history', () =>
    withDemoAuth(async () => {
      const { post, repo } = setup();
      const issued = (await (await post('/qr/issue', {}, 'patient', DEMO_IDS.patient)).json()) as { payload: string };
      // Dr Rao's facility is the patient's, so use an outside doctor to prove the grant path.
      repo.data.profiles.push({ id: 'doc-out', role: 'doctor', fullName: 'Dr Out', facilityId: 'f-other', isActive: true });
      const res = await post('/qr/scan', { payload: issued.payload }, 'doctor', 'doc-out');
      assert.equal(res.status, 200);
      const b = (await res.json()) as { ok: boolean; patientId: string; patient: { fullName: string }; history: { timeline: unknown[] }; grantExpiresAt: string };
      assert.equal(b.ok, true);
      assert.equal(b.patient.fullName, 'Rekha Kumari');
      assert.ok(b.history.timeline.length > 0);
      assert.ok(b.grantExpiresAt);
      assert.equal(repo.data.grants.length, 1);
      // Second use of the same token by another doctor is refused.
      repo.data.profiles.push({ id: 'doc-2', role: 'doctor', fullName: 'Dr Two', facilityId: 'f-other', isActive: true });
      const again = await post('/qr/scan', { payload: issued.payload }, 'doctor', 'doc-2');
      assert.equal(again.status, 403);
      assert.equal(((await again.json()) as { reason: string }).reason, 'token_already_used');
    }));

  it('accepts the offline demo payload', () =>
    withDemoAuth(async () => {
      const { post, repo } = setup();
      const res = await post('/qr/scan', { payload: `${DEMO_PAYLOAD_PREFIX}${DEMO_IDS.patientRecord}` }, 'doctor', DEMO_IDS.doctor);
      assert.equal(res.status, 200);
      const b = (await res.json()) as { ok: boolean; demo: boolean; history: { statCards: unknown[] } };
      assert.equal(b.ok, true);
      assert.equal(b.demo, true);
      assert.ok(b.history.statCards.length > 0);
      assert.equal(repo.data.accessLogs.at(-1)?.method, 'qr_scan');
      assert.equal((await post('/qr/scan', { payload: `${DEMO_PAYLOAD_PREFIX}nope` }, 'doctor', DEMO_IDS.doctor)).status, 404);
    }));

  it('a forged token, a foreign QR and a patient role are denied', () =>
    withDemoAuth(async () => {
      const { post } = setup();
      const forged = await signQrToken({ patientId: DEMO_IDS.patientRecord, secret: 'some-other-secret-that-is-also-32-bytes!!' });
      const f = await post('/qr/scan', { payload: toQrPayload(forged.token) }, 'doctor', DEMO_IDS.doctor);
      assert.equal(f.status, 403);
      assert.equal(((await f.json()) as { reason: string }).reason, 'bad_signature');
      const foreign = await post('/qr/scan', { payload: 'https://example.com/not-ours' }, 'doctor', DEMO_IDS.doctor);
      assert.equal(foreign.status, 400);
      assert.equal(((await foreign.json()) as { reason: string }).reason, 'not_aroghya_qr');
      const valid = await signQrToken({ patientId: DEMO_IDS.patientRecord, secret: SECRET });
      const asPatient = await post('/qr/scan', { payload: toQrPayload(valid.token) }, 'patient', DEMO_IDS.patient);
      assert.equal(asPatient.status, 403);
      assert.equal(((await asPatient.json()) as { reason: string; message: string }).reason, 'forbidden_role');
      assert.equal((await post('/qr/scan', {}, 'doctor', DEMO_IDS.doctor)).status, 400);
    }));
});
