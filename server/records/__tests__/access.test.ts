/**
 * Role-based access: each test tries to read data a role should NOT see and
 * checks it is refused (and logged). The SQL RLS policies are tested the same
 * way in `supabase/tests/4001_p4_rls.test.sql`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAccess } from '../access.ts';
import { listAccessLog, openPatientHistory } from '../service.ts';
import { FAC_B, NOW, makeRepo, minutes, patient, people } from './fixtures.ts';

test('patient sees only their own record', async () => {
  const repo = makeRepo();
  assert.deepEqual(await resolveAccess(repo, people.patientUser, patient.id, NOW), { allowed: true, basis: 'self' });
  assert.deepEqual(await resolveAccess(repo, people.otherPatientUser, patient.id, NOW), {
    allowed: false,
    reason: 'not_permitted',
  });
});

test('doctor at the patient’s facility can view; doctor elsewhere cannot', async () => {
  const repo = makeRepo();
  assert.deepEqual(await resolveAccess(repo, people.doctorA, patient.id, NOW), { allowed: true, basis: 'facility' });
  assert.deepEqual(await resolveAccess(repo, people.doctorB, patient.id, NOW), {
    allowed: false,
    reason: 'not_permitted',
  });
});

test('referral opens the record to the referred doctor or facility, until closed', async () => {
  const repo = makeRepo();
  repo.data.referrals.push({
    id: 'ref-1',
    patientId: patient.id,
    fromAshaId: people.asha.id,
    toDoctorId: null,
    toFacilityId: FAC_B,
    reason: 'BP 170/110 in third trimester',
    riskAlertId: null,
    status: 'pending',
    createdAt: NOW.toISOString(),
    seenAt: null,
    acceptedAt: null,
  });
  assert.deepEqual(await resolveAccess(repo, people.doctorB, patient.id, NOW), { allowed: true, basis: 'referral' });
  assert.deepEqual(await resolveAccess(repo, people.doctorB2, patient.id, NOW), { allowed: true, basis: 'referral' });

  repo.data.referrals[0]!.status = 'closed';
  assert.equal((await resolveAccess(repo, people.doctorB, patient.id, NOW)).allowed, false);
});

test('a QR grant without current consent does not open the record', async () => {
  const repo = makeRepo({ shareHistory: false });
  repo.data.grants.push({
    id: 'g1',
    patientId: patient.id,
    viewerId: people.doctorB.id,
    grantedVia: 'qr_scan',
    tokenJti: 'j1',
    createdAt: NOW.toISOString(),
    expiresAt: minutes(60).toISOString(),
    revokedAt: null,
  });
  assert.equal((await resolveAccess(repo, people.doctorB, patient.id, NOW)).allowed, false);
});

test('admin sees only their own facility’s patients', async () => {
  const repo = makeRepo();
  assert.deepEqual(await resolveAccess(repo, people.adminA, patient.id, NOW), {
    allowed: true,
    basis: 'admin_facility',
  });
  assert.equal((await resolveAccess(repo, people.adminB, patient.id, NOW)).allowed, false);
});

test('deactivated accounts see nothing, even at the right facility', async () => {
  const repo = makeRepo();
  const inactiveDoctorA = { ...people.doctorA, isActive: false };
  assert.deepEqual(await resolveAccess(repo, inactiveDoctorA, patient.id, NOW), {
    allowed: false,
    reason: 'inactive_account',
  });
});

test('ASHA workers are not granted history here (P3 owns ASHA access)', async () => {
  const repo = makeRepo();
  assert.equal((await resolveAccess(repo, people.asha, patient.id, NOW)).allowed, false);
});

test('every history open is logged, granted or denied', async () => {
  const repo = makeRepo();
  await openPatientHistory(repo, people.doctorA, patient.id, { now: NOW });
  await openPatientHistory(repo, people.doctorB, patient.id, { now: NOW });
  await openPatientHistory(repo, people.patientUser, patient.id, { now: NOW });
  assert.deepEqual(
    repo.data.accessLogs.map((l) => [l.viewerId, l.outcome, l.reason]),
    [
      [people.doctorA.id, 'granted', 'facility'],
      [people.doctorB.id, 'denied', 'not_permitted'],
      [people.patientUser.id, 'granted', 'self'],
    ],
  );
});

test('access log is readable by the patient and their facility admin only', async () => {
  const repo = makeRepo();
  await openPatientHistory(repo, people.doctorA, patient.id, { now: NOW });
  const mine = await listAccessLog(repo, people.patientUser, patient.id);
  assert.ok(mine.ok);
  assert.equal(mine.entries.length, 1);
  assert.equal((await listAccessLog(repo, people.adminA, patient.id)).ok, true);
  for (const viewer of [people.doctorA, people.doctorB, people.adminB, people.otherPatientUser, people.asha]) {
    assert.deepEqual(await listAccessLog(repo, viewer, patient.id), { ok: false, reason: 'not_permitted' });
  }
});

test('unknown patient id is refused', async () => {
  const repo = makeRepo();
  assert.deepEqual(await openPatientHistory(repo, people.doctorA, 'nope', { now: NOW }), {
    ok: false,
    reason: 'no_patient',
  });
});
