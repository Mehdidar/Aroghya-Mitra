import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_IDS } from '../../../packages/shared/demo.ts';
import { createRouter } from '../../http/router.ts';
import { demoMemoryData } from '../demoSeed.ts';
import { MemoryRecordsRepository } from '../memoryRepository.ts';
import { routes } from '../routes.ts';

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

const call = (handler: (r: Request) => Promise<Response>, path: string, role: string, user?: string) =>
  handler(new Request(`http://x${path}`, { headers: { 'x-demo-role': role, ...(user ? { 'x-demo-user': user } : {}) } }));

describe('GET /records/history/:patientId', () => {
  it('the patient sees their own history, with stat cards and a timeline', () =>
    withDemoAuth(async () => {
      const repo = new MemoryRecordsRepository(demoMemoryData());
      const handler = createRouter(routes({ repo }));
      const res = await call(handler, `/records/history/${DEMO_IDS.patientRecord}`, 'patient', DEMO_IDS.patient);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean; basis: string; history: { patient: { fullName: string }; statCards: unknown[]; timeline: unknown[] } };
      assert.equal(body.ok, true);
      assert.equal(body.basis, 'self');
      assert.equal(body.history.patient.fullName, 'Rekha Kumari');
      assert.ok(body.history.statCards.length >= 4);
      assert.ok(body.history.timeline.length >= 5);
      assert.equal(repo.data.accessLogs.length, 1, 'the open is logged');
    }));

  it('the demo caller id maps to the demo cast', () =>
    withDemoAuth(async () => {
      const handler = createRouter(routes({ repo: new MemoryRecordsRepository(demoMemoryData()) }));
      const res = await call(handler, `/records/history/${DEMO_IDS.patientRecord}`, 'patient');
      assert.equal(res.status, 200);
    }));

  it('another patient is denied and the denial is logged', () =>
    withDemoAuth(async () => {
      const repo = new MemoryRecordsRepository(demoMemoryData());
      repo.data.profiles.push({ id: 'p-other', role: 'patient', fullName: 'Other', facilityId: null, isActive: true });
      const handler = createRouter(routes({ repo }));
      const res = await call(handler, `/records/history/${DEMO_IDS.patientRecord}`, 'patient', 'p-other');
      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { ok: false, reason: 'not_permitted' });
      assert.equal(repo.data.accessLogs[0]?.outcome, 'denied');
    }));

  it('the facility doctor sees it; an unknown patient is 404; no auth is 401', () =>
    withDemoAuth(async () => {
      const handler = createRouter(routes({ repo: new MemoryRecordsRepository(demoMemoryData()) }));
      const doc = await call(handler, `/records/history/${DEMO_IDS.patientRecord}`, 'doctor', DEMO_IDS.doctor);
      assert.equal(doc.status, 200);
      assert.equal(((await doc.json()) as { basis: string }).basis, 'facility');
      assert.equal((await call(handler, '/records/history/nope', 'doctor', DEMO_IDS.doctor)).status, 404);
      assert.equal((await handler(new Request(`http://x/records/history/${DEMO_IDS.patientRecord}`, { headers: { 'x-demo-role': 'root' } }))).status, 401);
    }));
});
