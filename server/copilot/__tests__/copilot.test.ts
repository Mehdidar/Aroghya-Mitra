import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_IDS } from '../../../packages/shared/demo.ts';
import { createRouter } from '../../http/router.ts';
import { demoMemoryData } from '../../records/demoSeed.ts';
import { MemoryRecordsRepository } from '../../records/memoryRepository.ts';
import type { LabResult } from '../../records/repository.ts';
import { validateLabEntry } from '../labEntry.ts';
import { compareLabs, displayLabValue } from '../labs.ts';
import type { CopilotLlm } from '../llm.ts';
import { unsupportedClaims, writeNarrative } from '../narrative.ts';
import { ConsultationNoteDraft } from '../notesSchema.ts';
import { routes } from '../routes.ts';
import { buildCopilotSummary } from '../summary.ts';
import { filterTimeline } from '../timeline.ts';

const NOW = new Date('2026-11-14T10:00:00.000Z');
const PID = DEMO_IDS.patientRecord;

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

const fakeLlm = (replies: string[]): CopilotLlm & { calls: number } => {
  const llm = { calls: 0, name: () => 'fake', call: async () => replies[Math.min(llm.calls++, replies.length - 1)]! };
  return llm;
};

const setup = (llm: CopilotLlm | null = null) => {
  const repo = new MemoryRecordsRepository(demoMemoryData(NOW));
  repo.data.profiles.push(
    { id: 'doc-other', role: 'doctor', fullName: 'Dr Other', facilityId: 'fac-elsewhere', isActive: true },
    { id: 'doc-off', role: 'doctor', fullName: 'Dr Off', facilityId: repo.data.patients[0].facilityId, isActive: false },
  );
  let n = 0;
  const handler = createRouter(routes({ repo, now: () => NOW, llm, newId: () => `id-${++n}` }));
  const req = (method: 'GET' | 'POST', path: string, role: string, user: string | undefined, body?: unknown) =>
    handler(new Request(`http://x${path}`, { method, headers: { 'x-demo-role': role, ...(user ? { 'x-demo-user': user } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }));
  return { repo, req };
};

const DICTATION = 'Rekha, 34 weeks, came with headache since two days and swelling of feet. BP 150 by 100, pulse 92. No blurring of vision. Urine protein trace. Impression: gestational hypertension, rule out pre-eclampsia. Plan: continue labetalol 100 mg twice daily, add nifedipine 10 mg at night for 7 days. Send CBC, LFT, urine protein. Review after one week or earlier if headache worsens.';
const MODEL_JSON = JSON.stringify({
  chiefComplaint: 'Headache for 2 days, swelling of feet',
  history: '34 weeks pregnant. No blurring of vision.',
  examination: 'BP 150/100, pulse 92. Urine protein trace.',
  vitals: { systolic: '150', diastolic: 100, heartRate: 92 },
  assessment: 'Gestational hypertension, rule out pre-eclampsia',
  plan: 'Continue labetalol, add nifedipine at night',
  labOrders: ['CBC', 'LFT', 'Urine protein'],
  followUp: 'After one week, earlier if headache worsens',
  medicines: [
    { name: 'Labetalol 100 mg', dose: '1 tablet', frequency: 'twice daily', duration: null, instructions: null },
    { name: 'Nifedipine 10 mg', dose: null, frequency: 'at night', duration: '7 days', instructions: null },
  ],
});

describe('copilot access control', () => {
  it('the facility doctor gets the summary and the open is logged', () =>
    withDemoAuth(async () => {
      const { repo, req } = setup();
      const res = await req('GET', `/copilot/summary/${PID}`, 'doctor', DEMO_IDS.doctor);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { basis: string; summary: { patient: { fullName: string } }; narrative: unknown };
      assert.equal(body.basis, 'facility');
      assert.equal(body.summary.patient.fullName, 'Rekha Kumari');
      assert.equal(body.narrative, null, 'no narrative unless asked');
      assert.equal(repo.data.accessLogs.at(-1)?.outcome, 'granted');
    }));

  it('a doctor from another facility (no referral, no QR grant) is denied and logged; inactive doctors and patients are denied', () =>
    withDemoAuth(async () => {
      const { repo, req } = setup();
      const other = await req('GET', `/copilot/summary/${PID}`, 'doctor', 'doc-other');
      assert.equal(other.status, 403);
      assert.equal(repo.data.accessLogs.at(-1)?.outcome, 'denied');
      assert.equal((await req('GET', `/copilot/labs/${PID}`, 'doctor', 'doc-other')).status, 403);
      assert.equal((await req('GET', `/copilot/summary/${PID}`, 'doctor', 'doc-off')).status, 403);
      assert.equal((await req('GET', `/copilot/summary/${PID}`, 'patient', DEMO_IDS.patient)).status, 403, 'patients do not use the copilot');
      assert.equal((await req('POST', '/copilot/notes', 'doctor', 'doc-other', { transcript: DICTATION, patientId: PID })).status, 403);
      assert.equal((await req('POST', '/copilot/labs', 'admin', undefined, { patientId: PID, observedAt: '2026-11-10', results: [{ testCode: 'hb', value: 9 }] })).status, 403, 'admins read, only doctors write');
      assert.equal((await req('GET', '/copilot/summary/nope', 'doctor', DEMO_IDS.doctor)).status, 404);
      const anon = await createRouter(routes({ repo, llm: null }))(new Request(`http://x/copilot/summary/${PID}`, { headers: { 'x-demo-role': 'root' } }));
      assert.equal(anon.status, 401);
    }));

  it('the facility admin may read the summary', () =>
    withDemoAuth(async () => {
      const { req } = setup();
      assert.equal((await req('GET', `/copilot/summary/${PID}`, 'admin', undefined)).status, 200);
    }));
});

describe('GET /copilot/summary is deterministic, the narrative is guarded', () => {
  it('summary facts come from the record: conditions, allergies, current medicines, labs, ASHA, referral', () => {
    const data = demoMemoryData(NOW);
    const bundle = { patient: data.patients[0], vitals: data.vitals, ashaVisits: data.ashaVisits, prescriptions: data.prescriptions, doseLogs: data.doseLogs, reports: data.reports, consultations: data.consultations, referrals: data.referrals, riskAlerts: data.riskAlerts, people: data.profiles };
    const s = buildCopilotSummary(bundle, data.labResults, { now: NOW });
    assert.deepEqual(s.allergies, ['Penicillin']);
    assert.deepEqual(s.conditions, ['Gestational hypertension']);
    assert.equal(s.pregnancy.pregnant, true);
    assert.equal(s.pregnancy.weeks, 34);
    assert.deepEqual(s.currentMedicines.map((m) => m.name), ['Labetalol 100 mg', 'Iron + folic acid', 'Calcium 500 mg'], 'the 3-day paracetamol from 120 days ago has ended');
    assert.equal(s.openReferrals.length, 1);
    assert.equal(s.asha.openAlerts.length, 1);
    assert.deepEqual(s.labs?.flagged.sort(), ['hb', 'urine_protein']);
    assert.ok(s.facts.some((f) => f.includes('Haemoglobin 10.2 → 9.6 g/dL (low)')), s.facts.join('\n'));
    assert.ok(s.facts.some((f) => f.includes('Urine protein (dipstick) nil → trace (high)')));
    assert.ok(s.facts.some((f) => f.startsWith('Blood pressure over time: 128/84')));
    const kinds = new Set(s.timeline.map((e) => e.kind));
    for (const k of ['vitals', 'lab', 'consultation', 'prescription', 'referral', 'risk_alert', 'asha_visit', 'report'] as const) assert.ok(kinds.has(k), k);
    assert.ok(filterTimeline(s.timeline, ['lab']).every((e) => e.kind === 'lab'));
    assert.ok(filterTimeline(s.timeline, null, { highRiskOnly: true }).every((e) => e.highRisk));
    // Same input, same output.
    assert.deepEqual(buildCopilotSummary(bundle, data.labResults, { now: NOW }).facts, s.facts);
  });

  it('a narrative that adds a number or a medicine is dropped; a faithful one is labelled as an AI draft', () =>
    withDemoAuth(async () => {
      const facts = ['Allergies: Penicillin.', 'Current medicines: Labetalol 100 mg, 1 tablet, Twice a day.', 'Latest vitals (2026-11-13): BP 150/100 mmHg.'];
      assert.deepEqual(unsupportedClaims('BP 150/100 on labetalol 100 mg.', facts), []);
      assert.deepEqual(unsupportedClaims('BP 160/100; start amlodipine.', facts).sort(), ['160', 'amlodipine']);
      assert.equal((await writeNarrative(facts, async () => 'BP rose to 170/110.')).ok, false);
      assert.equal((await writeNarrative(facts, null)).ok, false);

      const good = fakeLlm(['Rekha Kumari has gestational hypertension and a penicillin allergy; her latest BP is 150/100.']);
      const { req } = setup(good);
      const body = (await (await req('GET', `/copilot/summary/${PID}?narrative=1`, 'doctor', DEMO_IDS.doctor)).json()) as { narrative: { text: string | null; label: string } };
      assert.match(body.narrative.text ?? '', /150\/100/);
      assert.equal(body.narrative.label, 'AI draft — verify against the record');

      const { req: req2 } = setup(fakeLlm(['Her Hb is 7.1 and she needs a transfusion.']));
      const bad = (await (await req2('GET', `/copilot/summary/${PID}?narrative=1`, 'doctor', DEMO_IDS.doctor)).json()) as { narrative: { text: string | null; reason: string } };
      assert.equal(bad.narrative.text, null);
      assert.equal(bad.narrative.reason, 'unverified');
    }));
});

describe('lab comparison', () => {
  const lab = (id: string, code: string, value: number, at: string, low: number | null, high: number | null): LabResult => ({ id, patientId: 'p', reportId: null, testCode: code, testName: code, value, unit: code === 'hb' ? 'g/dL' : 'grade', referenceLow: low, referenceHigh: high, observedAt: at, enteredBy: 'd', source: 'manual', createdAt: at });

  it('orders values, gives change vs previous and flags out-of-range values', () => {
    const c = compareLabs([lab('2', 'hb', 9.6, '2026-10-29T00:00:00Z', 11, 15), lab('1', 'hb', 10.2, '2026-10-01T00:00:00Z', 11, 15), lab('3', 'fbs', 88, '2026-10-29T00:00:00Z', 70, 99), lab('4', 'urine_protein', 0, '2026-10-01T00:00:00Z', null, 0), lab('5', 'urine_protein', 1, '2026-10-29T00:00:00Z', null, 0)]);
    const hb = c.series.find((s) => s.testCode === 'hb')!;
    assert.deepEqual(hb.points.map((p) => p.value), [10.2, 9.6]);
    assert.equal(hb.change, -0.6);
    assert.equal(hb.changePercent, -5.9);
    assert.equal(hb.direction, 'down');
    assert.equal(hb.latest.flag, 'low');
    assert.equal(hb.worsening, true);
    const up = c.series.find((s) => s.testCode === 'urine_protein')!;
    assert.equal(up.latest.display, 'trace');
    assert.equal(up.previous?.display, 'nil');
    assert.equal(up.changePercent, null, 'no percent for grades');
    assert.equal(c.series.find((s) => s.testCode === 'fbs')!.outOfRange, false);
    assert.deepEqual(c.flagged.sort(), ['hb', 'urine_protein']);
    assert.equal(c.series.at(-1)!.testCode, 'fbs', 'in-range tests last');
    assert.equal(displayLabValue('hb', 10), '10.0');
  });

  it('validates doctor entry: units, plausible values, grades, dates; pregnancy reference range by default', () => {
    const ctx = { enteredBy: 'doc', now: NOW, newId: () => 'x', pregnant: true };
    const ok = validateLabEntry({ patientId: 'p', observedAt: '2026-11-10', results: [{ testCode: 'hb', value: '9.4' }, { testCode: 'urine_protein', value: 'Trace' }, { testCode: 'vit_d', testName: 'Vitamin D', value: 18, unit: 'ng/mL', referenceLow: 30, referenceHigh: 100 }] }, ctx);
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.rows[0].referenceLow, 11, 'pregnancy Hb cut-off');
      assert.equal(ok.rows[1].value, 1);
      assert.equal(ok.rows[2].unit, 'ng/mL');
      assert.equal(ok.rows[0].observedAt, '2026-11-10T00:00:00.000Z');
    }
    const bad = validateLabEntry({ patientId: 'p', observedAt: '2027-01-01', results: [{ testCode: 'hb', value: 96, unit: 'g/L' }, { testCode: 'urine_protein', value: 'lots' }, { testCode: 'mystery', value: 3 }] }, ctx);
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      const all = bad.errors.join('\n');
      for (const want of ['future', 'g/dL', 'plausible', 'nil, trace', 'testName', 'unit: required']) assert.match(all, new RegExp(want), want);
    }
    assert.equal(validateLabEntry({ patientId: 'p', observedAt: 'yesterday', results: [] }, ctx).ok, false);
  });

  it('POST /copilot/labs saves for the doctor and returns the new comparison; GET shows it', () =>
    withDemoAuth(async () => {
      const { repo, req } = setup();
      const before = repo.data.labResults.length;
      const res = await req('POST', '/copilot/labs', 'doctor', DEMO_IDS.doctor, { patientId: PID, observedAt: '2026-11-13', results: [{ testCode: 'hb', value: 9.1 }] });
      assert.equal(res.status, 200);
      assert.equal(repo.data.labResults.length, before + 1);
      assert.equal(repo.data.labResults.at(-1)?.enteredBy, DEMO_IDS.doctor);
      const g = (await (await req('GET', `/copilot/labs/${PID}`, 'doctor', DEMO_IDS.doctor)).json()) as { comparison: { series: { testCode: string; points: unknown[] }[] } };
      assert.equal(g.comparison.series.find((s) => s.testCode === 'hb')!.points.length, 3);
      const invalid = await req('POST', '/copilot/labs', 'doctor', DEMO_IDS.doctor, { patientId: PID, observedAt: '2026-11-13', results: [{ testCode: 'hb', value: 200 }] });
      assert.equal(invalid.status, 400);
      assert.equal(repo.data.labResults.length, before + 1, 'nothing saved from an invalid entry');
    }));
});

describe('POST /copilot/notes (fake model)', () => {
  it('returns a validated draft and saves nothing', () =>
    withDemoAuth(async () => {
      const llm = fakeLlm([MODEL_JSON]);
      const { repo, req } = setup(llm);
      const consultations = repo.data.consultations.length;
      const prescriptions = repo.data.prescriptions.length;
      const res = await req('POST', '/copilot/notes', 'doctor', DEMO_IDS.doctor, { transcript: DICTATION, patientId: PID, language: 'en' });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { draft: ConsultationNoteDraft; approved: boolean };
      assert.equal(body.approved, false);
      assert.equal(body.draft.vitals.systolic, 150);
      assert.equal(body.draft.vitals.temperatureC, null);
      assert.deepEqual(body.draft.medicines.map((m) => m.name), ['Labetalol 100 mg', 'Nifedipine 10 mg']);
      assert.deepEqual(body.draft.labOrders, ['CBC', 'LFT', 'Urine protein']);
      assert.equal(repo.data.consultations.length, consultations);
      assert.equal(repo.data.prescriptions.length, prescriptions);
    }));

  it('repairs once after invalid JSON, then gives up honestly', () =>
    withDemoAuth(async () => {
      const llm = fakeLlm(['not json', MODEL_JSON]);
      const { req } = setup(llm);
      assert.equal((await req('POST', '/copilot/notes', 'doctor', DEMO_IDS.doctor, { transcript: DICTATION, patientId: PID })).status, 200);
      assert.equal(llm.calls, 2);
      const { req: req2 } = setup(fakeLlm(['still not json']));
      const res = await req2('POST', '/copilot/notes', 'doctor', DEMO_IDS.doctor, { transcript: DICTATION, patientId: PID });
      assert.equal(res.status, 502);
      assert.equal(((await res.json()) as { reason: string }).reason, 'unparseable');
    }));

  it('no model, empty transcript', () =>
    withDemoAuth(async () => {
      const { req } = setup(null);
      assert.equal((await req('POST', '/copilot/notes', 'doctor', DEMO_IDS.doctor, { transcript: DICTATION, patientId: PID })).status, 503);
      assert.equal((await req('POST', '/copilot/notes', 'doctor', DEMO_IDS.doctor, { transcript: ' ', patientId: PID })).status, 400);
    }));

  it('schema drops implausible vitals and nameless medicines instead of guessing', () => {
    const d = ConsultationNoteDraft.parse({ vitals: { bp: '150/100', spo2: 300, temperatureC: '101' }, medicines: [{ dose: '1 tab' }, { name: 'Paracetamol 500 mg' }], labOrders: 'CBC; LFT', assessment: 'N/A' });
    assert.equal(d.vitals.systolic, 150);
    assert.equal(d.vitals.spo2, null);
    assert.equal(d.vitals.temperatureC, 38.3);
    assert.deepEqual(d.medicines.map((m) => m.name), ['Paracetamol 500 mg']);
    assert.deepEqual(d.labOrders, ['CBC', 'LFT']);
    assert.equal(d.assessment, null);
  });
});
