import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_IDS, DEMO_PROFILES } from '../../../packages/shared/demo.ts';
import { isUuid, sameRecord, toDbId } from '../../../packages/shared/ids.ts';
import type { Consultation, Prescription, Profile } from '../../../packages/shared/types.ts';
import { batchFor } from '../../asha/routes.ts';
import { demoMemoryData } from '../demoSeed.ts';
import { MemoryRecordsRepository } from '../memoryRepository.ts';
import { PushError, push } from '../push.ts';

const P = DEMO_IDS.patientRecord;
const who = (role: Profile['role']) => DEMO_PROFILES.find((p) => p.role === role)!;
const rx = (over: Partial<Prescription> = {}): Prescription => ({
  id: 'rx-test-1', patientId: P, prescribedBy: DEMO_IDS.doctor, source: 'doctor', issuedAt: new Date().toISOString(), diagnosis: 'x',
  items: [{ name: 'Methyldopa 250 mg', dosage: '1 tablet', frequency: 'Twice a day', timesOfDay: ['morning', 'night'], durationDays: 5 }], notes: null, ...over,
});
const cons = (over: Partial<Consultation> = {}): Consultation => ({
  id: 'cons-test-1', patientId: P, doctorId: DEMO_IDS.doctor, facilityId: null, startedAt: new Date().toISOString(), notes: 'n', diagnosis: null,
  labOrders: [], followUpDate: null, prescriptionId: 'rx-test-1', referralId: null, ...over,
});

describe('toDbId', () => {
  it('passes UUIDs through and hashes anything else to a stable, valid UUID', () => {
    assert.equal(toDbId(P), P);
    const a = toDbId('rx-lq3k2-ab12cd');
    assert.ok(isUuid(a));
    assert.equal(a, toDbId('rx-lq3k2-ab12cd'));
    assert.notEqual(a, toDbId('rx-lq3k2-ab12ce'));
    assert.ok(sameRecord('vit-1', toDbId('vit-1')));
  });
});

describe('push', () => {
  it('a doctor saves a prescription and consultation for a patient they may open, and accepts a referral addressed to them', async () => {
    const repo = new MemoryRecordsRepository(demoMemoryData());
    const r = await push(repo, who('doctor'), { prescriptions: [rx()], consultations: [cons()], referrals: [{ id: DEMO_IDS.referral, status: 'accepted' }] });
    assert.deepEqual(r.rejected, []);
    assert.equal(r.saved.prescriptions, 1);
    assert.equal(r.saved.consultations, 1);
    assert.equal(r.saved.referrals, 1);
    assert.equal((await repo.getReferral(DEMO_IDS.referral))?.status, 'accepted');
    const bundle = await repo.loadRecordBundle(P);
    assert.ok(bundle?.prescriptions.some((p) => p.id === 'rx-test-1'));
  });

  it('pushing the same record twice keeps one row', async () => {
    const repo = new MemoryRecordsRepository(demoMemoryData());
    await push(repo, who('doctor'), { prescriptions: [rx()] });
    await push(repo, who('doctor'), { prescriptions: [rx({ notes: 'edited' })] });
    const rows = repo.data.prescriptions.filter((p) => p.id === 'rx-test-1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].notes, 'edited');
  });

  it('refuses rows in someone else\'s name, and rows for a patient the caller may not open', async () => {
    const repo = new MemoryRecordsRepository(demoMemoryData());
    const r = await push(repo, who('doctor'), {
      prescriptions: [rx({ prescribedBy: DEMO_IDS.admin })],
      consultations: [cons({ doctorId: DEMO_IDS.admin })],
      doseLogs: [{ id: 'd1', patientId: P, prescriptionId: null, medicineName: 'x', scheduledAt: new Date().toISOString(), status: 'taken', takenAt: null }],
    });
    assert.deepEqual(r.rejected.map((x) => x.reason).sort(), ['doctor_only', 'must_be_prescribed_by_you', 'not_permitted']);
    const stranger: Profile = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'doctor', fullName: 'Other', facilityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isActive: true };
    const r2 = await push(repo, stranger, { prescriptions: [rx({ prescribedBy: stranger.id })], referrals: [{ id: DEMO_IDS.referral, status: 'closed' }] });
    assert.deepEqual(r2.rejected.map((x) => x.reason).sort(), ['not_addressed_to_you', 'not_permitted']);
    assert.equal((await repo.getReferral(DEMO_IDS.referral))?.status, 'pending');
  });

  it('a patient logs doses and adds scanned prescriptions for their own record only', async () => {
    const repo = new MemoryRecordsRepository(demoMemoryData());
    const dose = { id: 'rx-test-1:morning:2026-11-13', patientId: P, prescriptionId: null, medicineName: 'Methyldopa 250 mg', scheduledAt: new Date().toISOString(), status: 'taken' as const, takenAt: new Date().toISOString() };
    const r = await push(repo, who('patient'), { doseLogs: [dose], prescriptions: [rx({ id: 'scan-1', source: 'scan', prescribedBy: null })] });
    assert.equal(r.saved.doseLogs, 1);
    assert.equal(r.saved.prescriptions, 1);
    const r2 = await push(repo, who('patient'), { prescriptions: [rx({ id: 'forged' })] });
    assert.equal(r2.rejected[0]?.reason, 'patients_add_scanned_only');
  });

  it('ASHA and admin callers, and oversized batches, are refused outright', async () => {
    const repo = new MemoryRecordsRepository(demoMemoryData());
    await assert.rejects(push(repo, who('asha'), {}), (e: unknown) => e instanceof PushError && e.status === 403);
    await assert.rejects(push(repo, who('admin'), {}), (e: unknown) => e instanceof PushError && e.status === 403);
    await assert.rejects(push(repo, who('doctor'), { doseLogs: Array.from({ length: 501 }, () => ({})) }), (e: unknown) => e instanceof PushError && e.status === 413);
  });
});

describe('ASHA sync → records', () => {
  it('a synced referral reaches the doctor inbox with the server-verified alert, and never moves back to pending', async () => {
    const repo = new MemoryRecordsRepository(demoMemoryData());
    const now = new Date().toISOString();
    const req = {
      ashaId: DEMO_IDS.asha,
      patients: [{ id: 'p-new', name: 'Test Lakshmi', sex: 'F' as const, dob: '2000-01-01', village: 'Rampur', categories: ['pregnant' as const], assignedAshaId: DEMO_IDS.asha, updatedAt: now }],
      visits: [{ id: 'v-new', patientId: 'p-new', ashaId: DEMO_IDS.asha, visitedAt: now, status: 'referred' as const, photos: [], source: 'manual' as const, updatedAt: now }],
      alerts: [{ id: 'phone-low', patientId: 'p-new', visitId: 'v-new', ruleId: 'x', severity: 'low' as const, reason: 'tampered', reasonKey: 'x', reasonParams: {}, evidence: [], source: 'phone', createdAt: now }],
      referrals: [{ id: 'r-new', patientId: 'p-new', fromAshaId: DEMO_IDS.asha, toDoctorId: DEMO_IDS.doctor, reason: 'BP high', alertIds: [], urgency: 'emergency' as const, status: 'pending' as const, createdAt: now, updatedAt: now }],
    };
    const verified = [{ id: 'p-new:preg_severe_htn', patientId: 'p-new', visitId: 'v-new', ruleId: 'preg_severe_htn', severity: 'critical' as const, reason: 'BP 162/112', reasonKey: 'k', reasonParams: {}, evidence: [], source: 'server', createdAt: now, verifiedBy: 'server' as const }];
    const batch = batchFor(req, { serverTime: now, patients: [], visits: [], referrals: [], verifiedAlerts: verified, accepted: { patients: 1, visits: 1, alerts: 1, referrals: 1 } });
    assert.deepEqual(batch.alerts.map((a) => a.id), ['p-new:preg_severe_htn'], 'the phone alert for a re-checked visit is dropped');
    await repo.saveAshaBatch(batch);

    const inbox = await repo.listInbox(who('doctor'));
    assert.ok(inbox.referrals.some((r) => r.id === 'r-new'));
    assert.ok(inbox.patients.some((p) => p.fullName === 'Test Lakshmi'));
    assert.deepEqual(inbox.riskAlerts.filter((a) => a.patientId === 'p-new').map((a) => a.level), ['high']);

    await repo.updateReferral('r-new', { status: 'accepted', acceptedAt: now });
    await repo.saveAshaBatch({ ...batch, referrals: [{ ...req.referrals[0], updatedAt: new Date(Date.now() + 1000).toISOString() }] });
    assert.equal((await repo.getReferral('r-new'))?.status, 'accepted');
  });
});
