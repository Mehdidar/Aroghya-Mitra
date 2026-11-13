import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueQrToken, scanQrPayload } from '../service.ts';
import { signQrToken, toQrPayload } from '../token.ts';
import { setShareHistory, openPatientHistory } from '../../records/service.ts';
import { NOW, SECRET, makeRepo, minutes, patient, people } from '../../records/__tests__/fixtures.ts';

const config = { secret: SECRET };

test('patient gets a QR only for themself and only with sharing on', async () => {
  const off = makeRepo({ shareHistory: false });
  assert.deepEqual(await issueQrToken(off, people.patientUser, patient.id, config, NOW), {
    ok: false,
    reason: 'consent_off',
  });

  const repo = makeRepo({ shareHistory: true });
  const other = await issueQrToken(repo, people.otherPatientUser, patient.id, config, NOW);
  assert.deepEqual(other, { ok: false, reason: 'not_permitted' });
  const doc = await issueQrToken(repo, people.doctorB, patient.id, config, NOW);
  assert.deepEqual(doc, { ok: false, reason: 'not_permitted' });

  const res = await issueQrToken(repo, people.patientUser, patient.id, config, NOW);
  assert.ok(res.ok);
  assert.match(res.payload, /^AM1\./);
  assert.equal(res.expiresAt, minutes(5).toISOString());
  assert.equal(res.refreshAt, minutes(4).toISOString(), 'refreshes one minute before expiry');
});

test('doctor from another facility scans with consent → history + grant + one access log', async () => {
  const repo = makeRepo({ shareHistory: true });
  const issued = await issueQrToken(repo, people.patientUser, patient.id, config, NOW);
  assert.ok(issued.ok);

  // Before scanning, doctor B (other facility) cannot open the record.
  const before = await openPatientHistory(repo, people.doctorB, patient.id, { now: NOW });
  assert.equal(before.ok, false);

  const scan = await scanQrPayload(repo, people.doctorB, issued.payload, config, minutes(1));
  assert.ok(scan.ok, JSON.stringify(scan));
  assert.equal(scan.patientId, patient.id);
  assert.equal(scan.history.patient.fullName, patient.fullName);
  assert.equal(repo.data.grants.length, 1);

  const logs = repo.data.accessLogs.filter((l) => l.viewerId === people.doctorB.id);
  assert.deepEqual(
    logs.map((l) => [l.method, l.outcome, l.reason]),
    [
      ['direct', 'denied', 'not_permitted'],
      ['qr_scan', 'granted', 'qr_grant'],
    ],
  );

  // After the scan, the grant lets doctor B keep viewing, and each view is logged.
  const after = await openPatientHistory(repo, people.doctorB, patient.id, { now: minutes(30) });
  assert.ok(after.ok);
  assert.equal(after.basis, 'qr_grant');
  assert.equal(repo.data.accessLogs.length, 3);
});

test('scan is refused and logged when sharing is off', async () => {
  const repo = makeRepo({ shareHistory: false });
  const { token } = await signQrToken({ patientId: patient.id, secret: SECRET, now: NOW });
  const scan = await scanQrPayload(repo, people.doctorB, toQrPayload(token), config, NOW);
  assert.deepEqual(scan, { ok: false, reason: 'consent_off' });
  assert.equal(repo.data.grants.length, 0);
  assert.equal(repo.data.accessLogs.at(-1)?.outcome, 'denied');
  assert.equal(repo.data.accessLogs.at(-1)?.reason, 'consent_off');
});

test('expired QR is refused and the attempt is logged against the patient', async () => {
  const repo = makeRepo({ shareHistory: true });
  const issued = await issueQrToken(repo, people.patientUser, patient.id, config, NOW);
  assert.ok(issued.ok);
  const scan = await scanQrPayload(repo, people.doctorB, issued.payload, config, minutes(6));
  assert.deepEqual(scan, { ok: false, reason: 'expired' });
  assert.equal(repo.data.accessLogs.at(-1)?.reason, 'expired');
});

test('forged or foreign QR codes are refused without touching the record', async () => {
  const repo = makeRepo({ shareHistory: true });
  const { token } = await signQrToken({
    patientId: patient.id,
    secret: 'attacker-secret-that-is-also-32-bytes!!',
    now: NOW,
  });
  assert.deepEqual(await scanQrPayload(repo, people.doctorB, toQrPayload(token), config, NOW), {
    ok: false,
    reason: 'bad_signature',
  });
  assert.deepEqual(await scanQrPayload(repo, people.doctorB, 'upi://pay?pa=x', config, NOW), {
    ok: false,
    reason: 'not_aroghya_qr',
  });
  assert.equal(repo.data.accessLogs.length, 0, 'unsigned data cannot write logs for a patient');
});

test('only active doctors can scan', async () => {
  const repo = makeRepo({ shareHistory: true });
  for (const [viewer, reason] of [
    [people.adminB, 'forbidden_role'],
    [people.asha, 'forbidden_role'],
    [people.otherPatientUser, 'forbidden_role'],
    [people.inactiveDoctorB, 'inactive_account'],
  ] as const) {
    const issued = await issueQrToken(repo, people.patientUser, patient.id, config, NOW);
    assert.ok(issued.ok);
    assert.deepEqual(await scanQrPayload(repo, viewer, issued.payload, config, NOW), { ok: false, reason });
  }
  assert.equal(repo.data.grants.length, 0);
});

test('one QR cannot be redeemed by a second doctor; the first doctor can rescan', async () => {
  const repo = makeRepo({ shareHistory: true });
  const issued = await issueQrToken(repo, people.patientUser, patient.id, config, NOW);
  assert.ok(issued.ok);
  assert.equal((await scanQrPayload(repo, people.doctorB, issued.payload, config, NOW)).ok, true);
  assert.equal((await scanQrPayload(repo, people.doctorB, issued.payload, config, minutes(1))).ok, true);
  assert.deepEqual(await scanQrPayload(repo, people.doctorB2, issued.payload, config, minutes(2)), {
    ok: false,
    reason: 'token_already_used',
  });
  assert.equal(repo.data.grants.length, 1, 'rescan reuses the existing grant');
});

test('turning sharing off revokes access gained by QR immediately', async () => {
  const repo = makeRepo({ shareHistory: true });
  const issued = await issueQrToken(repo, people.patientUser, patient.id, config, NOW);
  assert.ok(issued.ok);
  assert.ok((await scanQrPayload(repo, people.doctorB, issued.payload, config, NOW)).ok);

  const toggled = await setShareHistory(repo, people.patientUser, patient.id, false, minutes(1));
  assert.ok(toggled.ok);
  assert.equal(toggled.revokedGrants, 1);

  const res = await openPatientHistory(repo, people.doctorB, patient.id, { now: minutes(2) });
  assert.deepEqual(res, { ok: false, reason: 'not_permitted' });

  // Turning it back on does not resurrect old grants: the doctor must scan again.
  await setShareHistory(repo, people.patientUser, patient.id, true, minutes(3));
  assert.equal((await openPatientHistory(repo, people.doctorB, patient.id, { now: minutes(4) })).ok, false);
});

test('QR access ends when the grant expires', async () => {
  const repo = makeRepo({ shareHistory: true });
  const issued = await issueQrToken(repo, people.patientUser, patient.id, config, NOW);
  assert.ok(issued.ok);
  const scan = await scanQrPayload(repo, people.doctorB, issued.payload, { ...config, grantHours: 1 }, NOW);
  assert.ok(scan.ok);
  assert.equal((await openPatientHistory(repo, people.doctorB, patient.id, { now: minutes(59) })).ok, true);
  assert.equal((await openPatientHistory(repo, people.doctorB, patient.id, { now: minutes(61) })).ok, false);
});

test('only the patient can change their sharing toggle', async () => {
  const repo = makeRepo({ shareHistory: true });
  for (const viewer of [people.doctorA, people.adminA, people.otherPatientUser]) {
    assert.deepEqual(await setShareHistory(repo, viewer, patient.id, false, NOW), {
      ok: false,
      reason: 'not_permitted',
    });
  }
  assert.equal(repo.data.consents[0]?.shareHistory, true);
});
