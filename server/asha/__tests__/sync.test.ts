import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRouter } from '../../http/router.ts';
import type { Caller } from '../../http/auth.ts';
import { routes } from '../routes.ts';
import { MemoryStore, SyncError, photoName, sync, type StoredPatient } from '../sync.ts';

const asha: Caller = { id: 'asha-1', role: 'asha', via: 'demo' };
const other: Caller = { id: 'asha-2', role: 'asha', via: 'demo' };
const admin: Caller = { id: 'adm', role: 'admin', via: 'demo' };
const doctor: Caller = { id: 'doc', role: 'doctor', via: 'demo' };

const T0 = '2026-11-12T10:00:00.000Z';
const T1 = '2026-11-13T10:00:00.000Z';

const rekha = (updatedAt = T0): StoredPatient => ({
  id: 'p1',
  name: 'Rekha Kumari',
  sex: 'F',
  dob: '2002-05-01T00:00:00.000Z',
  village: 'Rampur',
  categories: ['pregnant'],
  pregnancy: { lmp: '2026-03-20T00:00:00.000Z', gravida: 1 },
  assignedAshaId: 'asha-1',
  updatedAt,
});

const visit = (id = 'v1') => ({
  id,
  patientId: 'p1',
  ashaId: 'asha-1',
  visitedAt: T1,
  status: 'completed' as const,
  vitals: { recordedAt: T1, systolic: 150, diastolic: 100, symptoms: ['severe_headache' as const, 'swelling_face_hands' as const] },
  photos: [],
  source: 'manual' as const,
  updatedAt: T1,
});

describe('sync', () => {
  it('requires ashaId and refuses other roles / other ASHAs', () => {
    const store = new MemoryStore();
    assert.throws(() => sync({}, asha, store), (e: unknown) => e instanceof SyncError && e.status === 400);
    assert.throws(() => sync({ ashaId: 'asha-1' }, other, store), (e: unknown) => e instanceof SyncError && e.status === 403);
    assert.throws(() => sync({ ashaId: 'asha-1' }, doctor, store), (e: unknown) => e instanceof SyncError && e.status === 403);
    assert.equal(sync({ ashaId: 'asha-1' }, admin, store).accepted.patients, 0, 'admins may sync any caseload');
  });

  it('round trip: push, then a second device pulls everything, then nothing since serverTime', () => {
    const store = new MemoryStore();
    const r = sync({ ashaId: 'asha-1', patients: [rekha()], visits: [visit()], referrals: [] }, asha, store);
    assert.deepEqual(r.accepted, { patients: 1, visits: 1, alerts: 0, referrals: 0 });
    assert.equal(r.patients[0].id, 'p1');
    assert.equal(r.visits[0].id, 'v1');
    const again = sync({ ashaId: 'asha-1' }, asha, store);
    assert.equal(again.patients.length, 1);
    const later = sync({ ashaId: 'asha-1', since: '2999-01-01T00:00:00.000Z' }, asha, store);
    assert.equal(later.patients.length + later.visits.length, 0);
  });

  it('last write wins on updatedAt', () => {
    const store = new MemoryStore();
    sync({ ashaId: 'asha-1', patients: [{ ...rekha(T1), name: 'new' }] }, asha, store);
    sync({ ashaId: 'asha-1', patients: [{ ...rekha(T0), name: 'stale' }] }, asha, store);
    assert.equal(sync({ ashaId: 'asha-1' }, asha, store).patients[0].name, 'new');
  });

  it('another ASHA never sees this caseload', () => {
    const store = new MemoryStore();
    sync({ ashaId: 'asha-1', patients: [rekha()] }, asha, store);
    sync({ ashaId: 'asha-2', patients: [{ ...rekha(), id: 'p2', assignedAshaId: 'asha-2' }] }, other, store);
    assert.deepEqual(sync({ ashaId: 'asha-2' }, other, store).patients.map((p) => p.id), ['p2']);
  });

  it('re-verifies risk: a tampered "low" severity from the phone becomes the server verdict', () => {
    const store = new MemoryStore();
    const tampered = {
      id: 'p1:preg_severe_htn_symptoms:v1',
      patientId: 'p1',
      visitId: 'v1',
      ruleId: 'preg_severe_htn_symptoms',
      severity: 'low' as const,
      reason: 'fine',
      reasonKey: 'x',
      reasonParams: {},
      evidence: [],
      source: 'phone',
      createdAt: T1,
    };
    const r = sync({ ashaId: 'asha-1', patients: [rekha()], visits: [visit()], alerts: [tampered] }, asha, store);
    assert.ok(r.verifiedAlerts.length > 0, 'server computed alerts for the visit');
    assert.ok(r.verifiedAlerts.every((a) => a.verifiedBy === 'server'));
    assert.equal(r.verifiedAlerts[0].severity, 'critical', 'BP 150/100 with severe headache in pregnancy is critical');
    const stored = Object.values(store.load<{ severity: string; verifiedBy: string; visitId?: string }>('alerts')).map((x) => x.record);
    assert.ok(stored.every((a) => a.verifiedBy === 'server'), 'no phone-computed alert survives for the visit');
    assert.ok(!stored.some((a) => a.severity === 'low'));
  });

  it('photo names are safe and unique', () => {
    const a = photoName('../../etc/passwd.PNG');
    const b = photoName('weird name.exe');
    assert.match(a, /^[a-f0-9]{32}\.png$/);
    assert.match(b, /^[a-f0-9]{32}\.jpg$/);
    assert.notEqual(a, b);
  });
});

describe('routes', () => {
  it('serves sync and photos over the router with demo auth', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'asha-'));
    const handler = createRouter(routes(new MemoryStore(), dir));
    const h = { 'x-demo-role': 'asha', 'x-demo-user': 'asha-1', 'content-type': 'application/json' };
    const ok = await handler(new Request('http://x/asha/sync', { method: 'POST', headers: h, body: JSON.stringify({ ashaId: 'asha-1', patients: [rekha()] }) }));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).accepted.patients, 1);
    const forbidden = await handler(new Request('http://x/asha/sync', { method: 'POST', headers: { ...h, 'x-demo-role': 'doctor' }, body: JSON.stringify({ ashaId: 'asha-1' }) }));
    assert.equal(forbidden.status, 403);
    assert.equal((await handler(new Request('http://x/asha/sync', { method: 'POST', headers: h, body: 'nope' }))).status, 400);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'visit.jpg');
    const up = await handler(new Request('http://x/asha/photos', { method: 'POST', headers: { 'x-demo-role': 'asha', 'x-demo-user': 'asha-1' }, body: form }));
    assert.equal(up.status, 200);
    const { url } = (await up.json()) as { url: string };
    assert.match(url, /^http:\/\/x\/asha\/photos\/[a-f0-9]{32}\.jpg$/);
    const got = await handler(new Request(url, { headers: { 'x-demo-role': 'doctor' } }));
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/jpeg');
    assert.equal((await handler(new Request('http://x/asha/photos/..%2Fnope.jpg', { headers: { 'x-demo-role': 'doctor' } }))).status, 404);
  });
});
