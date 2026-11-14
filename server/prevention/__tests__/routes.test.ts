import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEMO_IDS } from '../../../packages/shared/demo.ts';
import { GUIDELINES } from '../../../packages/patient-ai/prevention/guidelines/index.ts';
import { createRouter } from '../../http/router.ts';
import { demoMemoryData } from '../../records/demoSeed.ts';
import { MemoryRecordsRepository } from '../../records/memoryRepository.ts';
import { MemoryPreventionRepository, demoPreventionData } from '../repository.ts';
import { routes } from '../routes.ts';

const NOW = new Date(2026, 10, 14, 12);

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
  const records = new MemoryRecordsRepository(demoMemoryData(NOW));
  const repo = new MemoryPreventionRepository(demoPreventionData(NOW));
  return { records, repo, handler: createRouter(routes({ records, repo, now: () => NOW })) };
}

const get = (h: (r: Request) => Promise<Response>, path: string, role: string, user?: string) => h(new Request(`http://x${path}`, { headers: { 'x-demo-role': role, ...(user ? { 'x-demo-user': user } : {}) } }));
const post = (h: (r: Request) => Promise<Response>, body: unknown, role: string, user?: string) =>
  h(new Request('http://x/prevention/records', { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-role': role, ...(user ? { 'x-demo-user': user } : {}) }, body: JSON.stringify(body) }));

type PlanBody = { ok: boolean; basis: string; plan: { gestationWeeks: number | null; items: { id: string; status: string; guideline: { id: string; version: string } }[]; flags: { code: string; params?: Record<string, unknown> }[] } };

describe('GET /prevention/:patientId', () => {
  it('Rekha sees her own plan: 34 weeks, Td done, anaemia flag, BP from vitals', () =>
    withDemoAuth(async () => {
      const { handler } = setup();
      const res = await get(handler, `/prevention/${DEMO_IDS.patientRecord}`, 'patient');
      assert.equal(res.status, 200);
      const body = (await res.json()) as PlanBody;
      assert.equal(body.basis, 'self');
      assert.equal(body.plan.gestationWeeks, 34);
      assert.equal(body.plan.items.find((i) => i.id === 'uip:td_pregnancy:2')?.status, 'done');
      assert.ok(body.plan.flags.some((f) => f.code === 'anaemia' && f.params?.hb === 9.6));
      assert.ok(body.plan.flags.some((f) => f.code === 'pregnancyBpHigh'));
      assert.ok(body.plan.items.every((i) => i.guideline.id && i.guideline.version));
    }));

  it('the assigned ASHA opens Baby of Sita (ASHA-only id) and Rekha', () =>
    withDemoAuth(async () => {
      const { handler } = setup();
      const baby = await get(handler, '/prevention/demo_p3', 'asha');
      assert.equal(baby.status, 200);
      const b = (await baby.json()) as PlanBody & { demo: boolean; canRecord: boolean };
      assert.equal(b.basis, 'asha_assigned');
      assert.equal(b.demo, true);
      assert.equal(b.canRecord, true);
      assert.ok(b.plan.flags.some((f) => f.code === 'lowBirthWeight'));
      assert.equal((await get(handler, `/prevention/${DEMO_IDS.patientRecord}`, 'asha')).status, 200);
    }));

  it('another ASHA, another patient and unknown ids are refused', () =>
    withDemoAuth(async () => {
      const { handler, records } = setup();
      records.data.profiles.push({ id: 'asha-2', role: 'asha', fullName: 'Other ASHA', facilityId: null, isActive: true });
      records.data.profiles.push({ id: 'p-2', role: 'patient', fullName: 'Other', facilityId: null, isActive: true });
      assert.equal((await get(handler, '/prevention/demo_p3', 'asha', 'asha-2')).status, 403);
      assert.equal((await get(handler, `/prevention/${DEMO_IDS.patientRecord}`, 'patient', 'p-2')).status, 403);
      assert.equal((await get(handler, '/prevention/demo_p3', 'patient')).status, 403);
      assert.equal((await get(handler, '/prevention/nobody', 'doctor')).status, 404);
    }));

  it('the facility doctor sees the plan', () =>
    withDemoAuth(async () => {
      const { handler } = setup();
      const res = await get(handler, `/prevention/${DEMO_IDS.patientRecord}`, 'doctor');
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as PlanBody).basis, 'facility');
    }));
});

describe('POST /prevention/records', () => {
  it('the ASHA records a vaccine, a weight and a screening for her patient; the plan updates', () =>
    withDemoAuth(async () => {
      const { handler, repo } = setup();
      const dob = repo.data.subjects.find((s) => s.name === 'Baby of Sita')!.dob!;
      const v = await post(handler, { kind: 'vaccination', patientId: 'demo_p3', record: { id: 'v-1', vaccineCode: 'penta', dose: 1, givenOn: '2026-11-14', batch: 'B1' } }, 'asha');
      assert.equal(v.status, 200);
      const saved = ((await v.json()) as { record: { source: string; givenBy: string } }).record;
      assert.equal(saved.source, 'asha');
      assert.equal(saved.givenBy, DEMO_IDS.asha);
      assert.equal((await post(handler, { kind: 'growth', patientId: 'demo_p3', record: { measuredOn: '2026-11-14', weightKg: 2.35 } }, 'asha')).status, 200);
      assert.equal((await post(handler, { kind: 'screening', patientId: DEMO_IDS.patientRecord, record: { kind: 'hb', screenedOn: '2026-11-14', value: { gdl: 10.8 } } }, 'asha')).status, 200);
      // Same id again: upsert, not a duplicate.
      await post(handler, { kind: 'vaccination', patientId: 'demo_p3', record: { id: 'v-1', vaccineCode: 'penta', dose: 1, givenOn: '2026-11-14' } }, 'asha');
      assert.equal(repo.data.vaccinations.filter((x) => x.id === 'v-1').length, 1);
      const plan = (await (await get(handler, '/prevention/demo_p3', 'asha')).json()) as PlanBody;
      assert.equal(plan.plan.items.find((i) => i.id === 'uip:penta:1')?.status, 'done');
      assert.ok(dob);
    }));

  it('a patient may only self-report a past vaccine, stored as self_reported', () =>
    withDemoAuth(async () => {
      const { handler } = setup();
      const ok = await post(handler, { kind: 'vaccination', patientId: DEMO_IDS.patientRecord, record: { vaccineCode: 'td', dose: 2, givenOn: '2018-05-01', givenBy: 'someone' } }, 'patient');
      assert.equal(ok.status, 200);
      const rec = ((await ok.json()) as { record: { source: string; givenBy: string | null } }).record;
      assert.equal(rec.source, 'self_reported');
      assert.equal(rec.givenBy, null);
      assert.equal((await post(handler, { kind: 'screening', patientId: DEMO_IDS.patientRecord, record: { kind: 'hb', screenedOn: '2026-11-14', value: { gdl: 12 } } }, 'patient')).status, 403);
    }));

  it('rejects bad input', () =>
    withDemoAuth(async () => {
      const { handler } = setup();
      const bad = async (record: unknown, kind = 'vaccination') => (await post(handler, { kind, patientId: DEMO_IDS.patientRecord, record }, 'asha')).status;
      assert.equal(await bad({ vaccineCode: 'nope', dose: 1, givenOn: '2026-11-01' }), 400);
      assert.equal(await bad({ vaccineCode: 'bcg', dose: 1, givenOn: '2027-01-01' }), 400, 'future date');
      assert.equal(await bad({ measuredOn: '2026-11-01' }, 'growth'), 400, 'no value');
      assert.equal(await bad({ kind: 'bp', screenedOn: '2026-11-01', value: { systolic: 80, diastolic: 120 } }, 'screening'), 400);
      assert.equal(await bad({ lmp: '2025-01-01' }, 'pregnancy'), 400);
      assert.equal(await bad({}, 'other'), 400);
    }));

  it('an admin cannot write', () =>
    withDemoAuth(async () => {
      const { handler } = setup();
      assert.equal((await post(handler, { kind: 'growth', patientId: DEMO_IDS.patientRecord, record: { measuredOn: '2026-11-01', weightKg: 58 } }, 'admin')).status, 403);
    }));
});

describe('GET /prevention/guidelines and the migration', () => {
  it('lists every guideline with version and review date', () =>
    withDemoAuth(async () => {
      const { handler } = setup();
      const body = (await (await get(handler, '/prevention/guidelines', 'patient')).json()) as { guidelines: { id: string; version: string; reviewDue: string; status: string }[] };
      assert.equal(body.guidelines.length, GUIDELINES.length);
      assert.ok(body.guidelines.every((g) => g.version && g.reviewDue && g.status === 'needs_clinical_review'));
    }));

  it('5101_preventive.sql seeds the same guideline ids and versions and is re-runnable', () => {
    const sql = readFileSync(join(import.meta.dirname, '..', '..', '..', 'supabase', 'migrations', '5101_preventive.sql'), 'utf8');
    for (const g of GUIDELINES) assert.ok(sql.includes(`('${g.id}', '${g.version.replace(/'/g, "''")}'`), `${g.id} ${g.version}`);
    const creates = sql.match(/create policy (\w+)/g) ?? [];
    for (const c of creates) assert.ok(sql.includes(`drop policy if exists ${c.split(' ')[2]} `), c);
    assert.ok(!/create table public\./.test(sql), 'tables use if not exists');
  });
});
