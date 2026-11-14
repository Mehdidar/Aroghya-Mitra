import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEMO_FACILITY, DEMO_IDS } from '../../../packages/shared/demo.ts';
import { createRouter } from '../../http/router.ts';
import { demoMemoryData } from '../../records/demoSeed.ts';
import { MemoryRecordsRepository } from '../../records/memoryRepository.ts';
import { issueQrToken } from '../../qr/service.ts';
import { routes as ashaRoutes, FilePhotoStore } from '../../asha/routes.ts';
import { MemoryStore, type StoredPatient } from '../../asha/sync.ts';
import { areaKey, areaMatches, cleanAreas, suggestAshas } from '../match.ts';
import { MemoryAshaConnectRepository } from '../repository.ts';
import { DEMO_AREAS, DEMO_SECOND_ASHA, routes as connectRoutes } from '../routes.ts';

const NOW = new Date('2026-11-15T04:30:00.000Z');
const SUNITA = DEMO_IDS.asha;
const GEETA = DEMO_SECOND_ASHA.id;
const REKHA = DEMO_IDS.patientRecord;
const NEW_USER = 'user-new';
const NEW_PATIENT = 'pt-user-new';
const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

function setup(opts: { realSecret?: boolean } = {}) {
  process.env.AUTH_MODE = 'demo';
  const records = new MemoryRecordsRepository(demoMemoryData(NOW));
  records.data.profiles.push(
    { ...DEMO_SECOND_ASHA },
    { id: 'asha-off', role: 'asha', fullName: 'Lakshmi Bai', facilityId: DEMO_FACILITY.id, isActive: false },
    { id: NEW_USER, role: 'patient', fullName: 'Asha Kiran', facilityId: null, isActive: true },
  );
  records.data.patients.push({
    id: NEW_PATIENT,
    userId: NEW_USER,
    fullName: 'Asha Kiran',
    dateOfBirth: null,
    sex: null,
    phone: '+91 90000 11111',
    facilityId: null,
    ashaWorkerId: null,
    area: null,
    bloodGroup: null,
    allergies: [],
    chronicConditions: [],
    createdAt: NOW.toISOString(),
  });
  const repo = new MemoryAshaConnectRepository({
    records: () => records.data,
    data: { areas: DEMO_AREAS.map((a) => ({ ...a, facilityId: DEMO_FACILITY.id, key: areaKey(a.area) })) },
  });
  const store = new MemoryStore();
  // Sunita's phone already synced Ramesh (Bhagwanpur) as hers.
  const ramesh: StoredPatient = { id: 'demo_p4', name: 'Ramesh Singh', sex: 'M', dob: '1959-01-01', village: 'Bhagwanpur', categories: ['elderly'], assignedAshaId: SUNITA, updatedAt: '2026-11-01T00:00:00.000Z' };
  store.save('patients', { demo_p4: { record: ramesh, receivedAt: '2026-11-01T00:00:00.000Z' } });
  records.data.patients.push({ ...records.data.patients[0], id: 'demo_p4', userId: null, fullName: 'Ramesh Singh', ashaWorkerId: SUNITA, area: 'Bhagwanpur' });

  let n = 0;
  const field = async () => ({ store, flush: async () => undefined });
  const qr = () => (opts.realSecret ? { secret: SECRET, demo: false } : { secret: SECRET, demo: true });
  const handler = createRouter([
    ...connectRoutes({ repo, records, field, now: () => NOW, newId: () => `id-${++n}`, qr }),
    // The sync route only (its own connect routes would duplicate the paths above).
    ...ashaRoutes(store, join(tmpdir(), 'am-connect-photos'), () => records, new FilePhotoStore(join(tmpdir(), 'am-connect-photos')), repo).filter((r) => r.path === '/asha/sync'),
  ]);
  const call = async (method: string, path: string, role: string, user?: string, body?: unknown) => {
    const res = await handler(
      new Request(`http://x${path}`, {
        method,
        headers: { 'x-demo-role': role, ...(user ? { 'x-demo-user': user } : {}), 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  return { records, repo, store, call };
}

describe('ashaConnect: matching', () => {
  it('normalises village names and matches whole words', () => {
    assert.equal(areaKey('  Rampur Village, '), 'rampur');
    const area = { ashaId: 'a', facilityId: null, area: 'Rampur', key: 'rampur' };
    assert.ok(areaMatches('Rampur, Hebbal', area));
    assert.ok(areaMatches('rampur gaon', area));
    assert.ok(!areaMatches('Rampura', area), 'no partial-word match');
    assert.ok(!areaMatches(null, area));
    assert.deepEqual(cleanAreas(['Rampur', ' rampur ', '', 7, 'Sonpur']), ['Rampur', 'Sonpur']);
  });

  it('prefers an active ASHA covering the village, then the least loaded', () => {
    const ashas = [
      { id: 'a', fullName: 'A', phone: null, facilityId: 'f', isActive: true },
      { id: 'b', fullName: 'B', phone: null, facilityId: 'f', isActive: true },
      { id: 'c', fullName: 'C', phone: null, facilityId: 'f', isActive: false },
    ];
    const areas = [
      { ashaId: 'b', facilityId: 'f', area: 'Sonpur', key: 'sonpur' },
      { ashaId: 'c', facilityId: 'f', area: 'Sonpur', key: 'sonpur' },
    ];
    const s = suggestAshas({ patientArea: 'Sonpur', patientFacilityId: 'f', ashas, areas, caseloads: new Map([['b', 40], ['a', 2]]) });
    assert.deepEqual(s.map((x) => [x.ashaId, x.match]), [['b', 'area'], ['a', 'facility']], 'inactive C never suggested; B covers the village despite a bigger caseload');
  });
});

describe('ashaConnect: a patient gets an ASHA', () => {
  it('shows "no ASHA" honestly, then assigns at once when an ASHA covers the village', async () => {
    const { call, records, store, repo } = setup();
    let r = await call('GET', '/asha/connect/mine', 'patient', NEW_USER);
    assert.equal(r.status, 200);
    assert.equal(r.body.asha, null);
    assert.equal(r.body.waitingSince, null);

    r = await call('POST', '/asha/connect/find', 'patient', NEW_USER, { area: 'Bhagwanpur village' });
    assert.equal(r.status, 200);
    assert.equal(r.body.method, 'area_match');
    assert.equal(r.body.asha.id, GEETA);
    assert.equal(r.body.asha.phone, null, 'no phone number on file: none shown');
    const row = records.data.patients.find((p) => p.id === NEW_PATIENT)!;
    assert.equal(row.ashaWorkerId, GEETA);
    assert.equal(row.facilityId, DEMO_FACILITY.id, 'takes the ASHA’s PHC');
    assert.equal(repo.data.events.at(-1)?.method, 'area_match');

    // Geeta's phone gets the patient, with unknown sex / age left unknown.
    const field = store.load<StoredPatient>('patients')[NEW_PATIENT].record;
    assert.equal(field.assignedAshaId, GEETA);
    assert.equal(field.sex, 'U');
    assert.equal(field.dob, '');
    assert.equal(field.needsDetails, true);
  });

  it('waits for the PHC when no ASHA covers the village; the admin assigns from the board', async () => {
    const { call, repo } = setup();
    let r = await call('POST', '/asha/connect/find', 'patient', NEW_USER, { area: 'Nowhere Nagar' });
    assert.equal(r.body.method, 'waiting');
    assert.equal(r.body.asha, null);
    assert.equal(r.body.waitingSince, NOW.toISOString());

    r = await call('GET', '/asha/assignments', 'admin');
    assert.equal(r.status, 200);
    assert.equal(r.body.canEdit, true);
    const first = r.body.patients[0];
    assert.equal(first.id, NEW_PATIENT, 'waiting patients first');
    assert.equal(first.requestedAt, NOW.toISOString());
    assert.equal(first.suggestion.match, 'facility');
    const sunita = r.body.ashas.find((a: any) => a.id === SUNITA);
    assert.deepEqual(sunita.areas, ['Rampur', 'Sonpur']);
    assert.ok(sunita.caseload >= 1);

    r = await call('POST', '/asha/assign', 'admin', undefined, { patientId: NEW_PATIENT, ashaId: SUNITA, reason: 'Nearest ASHA' });
    assert.equal(r.status, 200);
    assert.equal(repo.data.requests.length, 0, 'request cleared');
    r = await call('GET', '/asha/connect/mine', 'patient', NEW_USER);
    assert.equal(r.body.asha.fullName, 'Sunita Devi');
  });

  it('only the admin assigns; inactive ASHAs cannot be chosen; the doctor sees the board read-only', async () => {
    const { call } = setup();
    assert.equal((await call('POST', '/asha/assign', 'doctor', undefined, { patientId: NEW_PATIENT, ashaId: SUNITA })).status, 403);
    assert.equal((await call('POST', '/asha/assign', 'patient', NEW_USER, { patientId: NEW_PATIENT, ashaId: SUNITA })).status, 403);
    assert.equal((await call('POST', '/asha/assign', 'asha', SUNITA, { patientId: NEW_PATIENT, ashaId: SUNITA })).status, 403);
    const off = await call('POST', '/asha/assign', 'admin', undefined, { patientId: NEW_PATIENT, ashaId: 'asha-off' });
    assert.equal(off.status, 409);
    assert.equal(off.body.reason, 'asha_inactive');
    const board = await call('GET', '/asha/assignments', 'doctor');
    assert.equal(board.status, 200);
    assert.equal(board.body.canEdit, false);
    assert.equal((await call('GET', '/asha/assignments', 'patient', NEW_USER)).status, 403);
  });

  it('the admin edits the villages an ASHA covers', async () => {
    const { call } = setup();
    const r = await call('PUT', '/asha/areas', 'admin', undefined, { ashaId: GEETA, areas: ['Bhagwanpur', 'Nowhere Nagar', 'bhagwanpur'] });
    assert.deepEqual(r.body.areas, ['Bhagwanpur', 'Nowhere Nagar']);
    const found = await call('POST', '/asha/connect/find', 'patient', NEW_USER, { area: 'Nowhere Nagar' });
    assert.equal(found.body.asha.id, GEETA);
    assert.equal((await call('PUT', '/asha/areas', 'asha', GEETA, { ashaId: GEETA, areas: ['Anywhere'] })).status, 403);
  });
});

describe('ashaConnect: reassignment reaches both ASHA phones', () => {
  it('the new ASHA gets the patient, the old one is told to drop it and cannot take it back', async () => {
    const { call, records } = setup();
    const since = '2026-11-10T00:00:00.000Z';
    let r = await call('POST', '/asha/assign', 'admin', undefined, { patientId: 'demo_p4', ashaId: GEETA, reason: 'Bhagwanpur is Geeta’s village' });
    assert.equal(r.status, 200);

    r = await call('POST', '/asha/sync', 'asha', GEETA, { ashaId: GEETA, since, patients: [], visits: [], alerts: [], referrals: [] });
    assert.ok(r.body.patients.some((p: any) => p.id === 'demo_p4'), 'Geeta pulls Ramesh');

    // Sunita's phone still has the old record and edits it.
    const stale: StoredPatient = { id: 'demo_p4', name: 'Ramesh Singh', sex: 'M', dob: '1959-01-01', village: 'Bhagwanpur', categories: ['elderly'], assignedAshaId: SUNITA, updatedAt: '2026-11-15T09:00:00.000Z' };
    r = await call('POST', '/asha/sync', 'asha', SUNITA, { ashaId: SUNITA, since, patients: [stale], visits: [], alerts: [], referrals: [] });
    assert.deepEqual(r.body.released, ['demo_p4']);
    assert.deepEqual(r.body.rejectedPatientIds, ['demo_p4']);
    assert.equal(r.body.accepted.patients, 0);
    assert.equal(records.data.patients.find((p) => p.id === 'demo_p4')!.ashaWorkerId, GEETA, 'records keep the PHC’s choice');
  });
});

describe('ashaConnect: messages', () => {
  it('a patient message with an emergency sign is urgent and returns the 108 numbers', async () => {
    const { call } = setup();
    const r = await call('POST', '/asha/messages', 'patient', DEMO_IDS.patient, { kind: 'text', body: 'I have heavy bleeding' });
    assert.equal(r.status, 200);
    assert.equal(r.body.message.urgent, true);
    assert.deepEqual(r.body.message.emergencyCategories, ['bleeding']);
    assert.equal(r.body.emergency.contacts[0].number, '108');
    const plain = await call('POST', '/asha/messages', 'patient', DEMO_IDS.patient, { kind: 'text', body: 'I need my medicines' });
    assert.equal(plain.body.message.urgent, false);
    assert.equal(plain.body.emergency, null);
  });

  it('messages stay between the patient and their own ASHA', async () => {
    const { call } = setup();
    await call('POST', '/asha/messages', 'patient', DEMO_IDS.patient, { kind: 'text', body: 'When will you visit?' });
    let r = await call('GET', '/asha/messages', 'asha', SUNITA);
    assert.equal(r.body.messages.length, 1);
    assert.equal((await call('GET', `/asha/messages?patientId=${REKHA}`, 'asha', GEETA)).status, 403);
    assert.equal((await call('GET', '/asha/messages', 'asha', GEETA)).body.messages.length, 0);
    assert.equal((await call('POST', '/asha/messages', 'asha', GEETA, { patientId: REKHA, kind: 'text', body: 'hi' })).status, 403);
    assert.equal((await call('GET', '/asha/messages', 'doctor')).status, 403);

    r = await call('POST', '/asha/messages', 'asha', SUNITA, { patientId: REKHA, kind: 'text', body: 'I will come tomorrow morning.' });
    assert.equal(r.status, 200);
    r = await call('GET', '/asha/messages', 'patient', DEMO_IDS.patient);
    assert.deepEqual(r.body.messages.map((m: any) => m.from), ['patient', 'asha']);
    r = await call('POST', '/asha/messages/read', 'patient', DEMO_IDS.patient, {});
    assert.equal(r.body.read, 1, 'the patient read the ASHA’s reply');
  });

  it('a patient without an ASHA is told so; empty messages are refused', async () => {
    const { call } = setup();
    assert.equal((await call('POST', '/asha/messages', 'patient', NEW_USER, { kind: 'text', body: 'hello' })).body.reason, 'no_asha');
    assert.equal((await call('POST', '/asha/messages', 'patient', DEMO_IDS.patient, { kind: 'text', body: '   ' })).body.reason, 'empty');
    assert.equal((await call('POST', '/asha/messages', 'patient', DEMO_IDS.patient, { kind: 'visit_request', body: '' })).body.reason, 'when_required');
  });

  it('a visit request: accept needs a date, then done; status never moves back', async () => {
    const { call } = setup();
    const req = await call('POST', '/asha/messages', 'patient', DEMO_IDS.patient, { kind: 'visit_request', body: 'Swelling in my feet', visitWhen: 'tomorrow' });
    const id = req.body.message.id;
    assert.equal(req.body.message.status, 'open');
    assert.equal((await call('POST', `/asha/messages/${id}/status`, 'asha', SUNITA, { status: 'accepted' })).body.reason, 'date_required');
    assert.equal((await call('POST', `/asha/messages/${id}/status`, 'asha', GEETA, { status: 'accepted', scheduledFor: '2026-11-16T05:00:00.000Z' })).status, 403);
    let r = await call('POST', `/asha/messages/${id}/status`, 'asha', SUNITA, { status: 'accepted', scheduledFor: '2026-11-16T05:00:00.000Z' });
    assert.equal(r.body.message.status, 'accepted');
    assert.equal(r.body.message.scheduledFor, '2026-11-16T05:00:00.000Z');
    r = await call('POST', `/asha/messages/${id}/status`, 'asha', SUNITA, { status: 'done' });
    assert.equal(r.body.message.status, 'done');
    assert.equal((await call('POST', `/asha/messages/${id}/status`, 'asha', SUNITA, { status: 'accepted', scheduledFor: '2026-11-17T05:00:00.000Z' })).status, 409);
    assert.equal((await call('POST', `/asha/messages/${id}/status`, 'patient', DEMO_IDS.patient, { status: 'done' })).status, 403);
  });
});

describe('ashaConnect: the ASHA scans a patient’s QR card', () => {
  it('a valid card shows the visit summary and is logged', async () => {
    const { call, records } = setup({ realSecret: true });
    const rekha = (await records.getProfile(DEMO_IDS.patient))!;
    const issued = await issueQrToken(records, rekha, REKHA, { secret: SECRET }, NOW);
    assert.ok(issued.ok);
    const r = await call('POST', '/asha/scan', 'asha', SUNITA, { payload: (issued as any).payload });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.assignment, 'mine');
    assert.equal(r.body.summary.patient.fullName, 'Rekha Kumari');
    assert.equal(typeof r.body.summary.patient.ageYears, 'number');
    assert.ok(Array.isArray(r.body.summary.symptoms));
    assert.ok(r.body.summary.medicines.length > 0, 'current doctor medicines');
    const log = (await records.listAccessLogs(REKHA, 5))[0];
    assert.equal(log.viewerId, SUNITA);
    assert.equal(log.method, 'qr_scan');
    assert.equal(log.reason, 'asha_scan');

    // The same card cannot be used twice.
    assert.equal((await call('POST', '/asha/scan', 'asha', GEETA, { payload: (issued as any).payload })).body.reason, 'token_already_used');
  });

  it('no consent, no summary; the unsigned demo card only works on a demo server', async () => {
    const real = setup({ realSecret: true });
    assert.equal((await real.call('POST', '/asha/scan', 'asha', SUNITA, { payload: `AM1.demo.${REKHA}` })).body.reason, 'expired');
    const demo = setup();
    await demo.records.setConsent(REKHA, false, NOW);
    const r = await demo.call('POST', '/asha/scan', 'asha', SUNITA, { payload: `AM1.demo.${REKHA}` });
    assert.equal(r.status, 403);
    assert.equal(r.body.reason, 'consent_off');
    assert.equal((await demo.records.listAccessLogs(REKHA, 1))[0].outcome, 'denied');
    assert.equal((await demo.call('POST', '/asha/scan', 'doctor', undefined, { payload: `AM1.demo.${REKHA}` })).status, 403);
  });

  it('an ASHA adds an unassigned patient only after scanning them', async () => {
    const { call, records } = setup();
    await records.setConsent(NEW_PATIENT, true, NOW);
    assert.equal((await call('POST', '/asha/scan/add', 'asha', SUNITA, { patientId: NEW_PATIENT })).body.reason, 'scan_first');
    const s = await call('POST', '/asha/scan', 'asha', SUNITA, { payload: `AM1.demo.${NEW_PATIENT}` });
    assert.equal(s.body.assignment, 'none');
    assert.equal(s.body.canAdd, true);
    const add = await call('POST', '/asha/scan/add', 'asha', SUNITA, { patientId: NEW_PATIENT });
    assert.equal(add.body.added, true);
    assert.equal(records.data.patients.find((p) => p.id === NEW_PATIENT)!.ashaWorkerId, SUNITA);
    // Someone else's patient cannot be taken by scanning.
    const other = await call('POST', '/asha/scan', 'asha', GEETA, { payload: `AM1.demo.${NEW_PATIENT}` });
    assert.equal(other.body.assignment, 'other');
    assert.equal((await call('POST', '/asha/scan/add', 'asha', GEETA, { patientId: NEW_PATIENT })).status, 409);
  });
});
