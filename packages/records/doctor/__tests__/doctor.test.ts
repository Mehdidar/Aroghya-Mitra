import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, availableActions, buildInbox } from '../referrals.ts';
import { buildAdminAnalytics, buildDoctorDashboard, filterPatients, validatePatientForm } from '../dashboard.ts';
import type { AccessLog, Patient, Referral, RiskAlert } from '../../records/types.ts';

const NOW = new Date('2026-11-13T10:00:00.000Z'); // 15:30 IST

const ref = (id: string, status: Referral['status'], createdAt: string, riskAlertId: string | null = null): Referral => ({
  id, patientId: `p-${id}`, fromAshaId: 'asha', toDoctorId: 'doc', toFacilityId: null, reason: 'r', riskAlertId,
  status, createdAt, seenAt: null, acceptedAt: null,
});
const alert = (id: string, level: RiskAlert['level'], patientId = 'p1', createdAt = '2026-11-12T00:00:00Z', resolvedAt: string | null = null): RiskAlert => ({
  id, patientId, ashaWorkerId: 'asha', level, reason: 'x', createdAt, resolvedAt,
});

test('referral actions follow the allowed transitions', () => {
  const r = ref('1', 'pending', '2026-11-12T00:00:00Z');
  assert.deepEqual(availableActions(r), ['mark_seen', 'accept']);
  assert.deepEqual(applyAction(r, 'mark_seen', NOW), { status: 'seen', seenAt: NOW.toISOString() });
  assert.deepEqual(applyAction(r, 'accept', NOW), { status: 'accepted', seenAt: NOW.toISOString(), acceptedAt: NOW.toISOString() });
  assert.equal(applyAction(r, 'close', NOW), null);
  assert.deepEqual(availableActions(ref('2', 'closed', '2026-11-12T00:00:00Z')), []);
});

test('inbox: high risk first, then unread, then oldest; closed hidden', () => {
  const inbox = buildInbox(
    [
      ref('a', 'seen', '2026-11-10T00:00:00Z'),
      ref('b', 'pending', '2026-11-12T00:00:00Z'),
      ref('c', 'pending', '2026-11-11T00:00:00Z'),
      ref('d', 'seen', '2026-11-12T00:00:00Z', 'ra-high'),
      ref('e', 'closed', '2026-11-01T00:00:00Z'),
    ],
    [alert('ra-high', 'high')],
  );
  assert.deepEqual(inbox.map((i) => i.referral.id), ['d', 'c', 'b', 'a']);
  assert.equal(inbox[0]!.riskLevel, 'high');
});

test('doctor dashboard: today in IST, recent scans, open high-risk alerts', () => {
  const log = (id: string, createdAt: string, patientId: string, outcome: AccessLog['outcome'] = 'granted'): AccessLog => ({
    id, patientId, viewerId: 'doc', viewerRole: 'doctor', viewerName: null, method: 'qr_scan', outcome, reason: null, createdAt,
  });
  const d = buildDoctorDashboard({
    doctorId: 'doc',
    now: NOW,
    consultations: [
      { id: 'c1', patientId: 'p1', doctorId: 'doc', facilityId: null, startedAt: '2026-11-13T04:00:00Z', notes: null, diagnosis: null, labOrders: [], followUpDate: null, prescriptionId: null, referralId: null },
      { id: 'c2', patientId: 'p2', doctorId: 'doc', facilityId: null, startedAt: '2026-11-06T04:00:00Z', notes: null, diagnosis: null, labOrders: [], followUpDate: '2026-11-13', prescriptionId: null, referralId: null },
      { id: 'c3', patientId: 'p9', doctorId: 'other', facilityId: null, startedAt: '2026-11-13T04:00:00Z', notes: null, diagnosis: null, labOrders: [], followUpDate: null, prescriptionId: null, referralId: null },
    ],
    accessLogs: [
      log('l1', '2026-11-13T09:00:00Z', 'p3'),
      log('l2', '2026-11-12T18:00:00Z', 'p4'), // 23:30 IST on the 12th: not today
      log('l3', '2026-11-13T09:30:00Z', 'p5', 'denied'),
    ],
    referrals: [ref('r1', 'pending', '2026-11-12T00:00:00Z'), ref('r2', 'accepted', '2026-11-12T00:00:00Z')],
    riskAlerts: [alert('a1', 'high'), alert('a2', 'medium'), alert('a3', 'high', 'p1', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')],
  });
  assert.deepEqual(d.todaysPatients.map((p) => p.patientId).sort(), ['p1', 'p2', 'p3']);
  assert.deepEqual(d.recentScans.map((s) => s.id), ['l1', 'l2']);
  assert.deepEqual(d.highRiskAlerts.map((a) => a.id), ['a1']);
  assert.deepEqual(d.stats, { patientsToday: 3, scansToday: 1, openReferrals: 1, highRiskOpen: 1, followUpsDue: 1 });
});

test('patient search and filters', () => {
  const p = (id: string, fullName: string, extra: Partial<Patient> = {}): Patient => ({
    id, userId: null, fullName, dateOfBirth: null, sex: null, phone: null, facilityId: 'f', ashaWorkerId: null,
    area: null, bloodGroup: null, allergies: [], chronicConditions: [], createdAt: '', ...extra,
  });
  const list = [
    p('aa11', 'Ravi Kumar', { phone: '+91 98450 12345', area: 'Hebbal', ashaWorkerId: 'asha1', chronicConditions: ['Type 2 diabetes'] }),
    p('bb22', 'Lakshmi Devi', { area: 'Yelahanka', chronicConditions: ['Hypertension'] }),
    p('cc33', 'Kavya R', { area: 'Hebbal', ashaWorkerId: 'asha2' }),
  ];
  assert.deepEqual(filterPatients(list, { search: 'lak' }).map((x) => x.id), ['bb22']);
  assert.deepEqual(filterPatients(list, { search: '98450' }).map((x) => x.id), ['aa11']);
  assert.deepEqual(filterPatients(list, { search: 'cc' }).map((x) => x.id), ['cc33']);
  assert.deepEqual(filterPatients(list, { area: 'hebbal' }).map((x) => x.id), ['cc33', 'aa11']);
  assert.deepEqual(filterPatients(list, { condition: 'diabetes' }).map((x) => x.id), ['aa11']);
  assert.deepEqual(filterPatients(list, { unassignedOnly: true }).map((x) => x.id), ['bb22']);
});

test('patient form validation', () => {
  const ok = { fullName: 'Ravi', dateOfBirth: '1990-01-01', phone: '+91 98450-12345', bloodGroup: 'O+' };
  assert.deepEqual(validatePatientForm(ok, NOW), []);
  assert.deepEqual(validatePatientForm({ ...ok, fullName: ' ' }, NOW), ['name_required']);
  assert.deepEqual(validatePatientForm({ ...ok, dateOfBirth: '2030-01-01' }, NOW), ['dob_invalid']);
  assert.deepEqual(validatePatientForm({ ...ok, phone: '12345' }, NOW), ['phone_invalid']);
  assert.deepEqual(validatePatientForm({ ...ok, bloodGroup: 'C+' }, NOW), ['blood_group_invalid']);
});

test('admin analytics: visits per ASHA, high risk by area, adherence', () => {
  const a = buildAdminAnalytics({
    now: NOW,
    staff: [
      { id: 'asha1', role: 'asha', fullName: 'Savitha', facilityId: 'f', isActive: true },
      { id: 'asha2', role: 'asha', fullName: 'Meena', facilityId: 'f', isActive: false },
      { id: 'doc', role: 'doctor', fullName: 'Dr X', facilityId: 'f', isActive: true },
    ],
    patients: [
      { id: 'p1', area: 'Hebbal' } as Patient,
      { id: 'p2', area: 'Yelahanka' } as Patient,
    ],
    visits: [
      { id: 'v1', patientId: 'p1', ashaWorkerId: 'asha1', visitedAt: '2026-11-10T00:00:00Z', notes: null, riskLevel: 'high' },
      { id: 'v2', patientId: 'p2', ashaWorkerId: 'asha1', visitedAt: '2026-11-11T00:00:00Z', notes: null, riskLevel: 'low' },
      { id: 'v3', patientId: 'p2', ashaWorkerId: 'asha2', visitedAt: '2026-09-01T00:00:00Z', notes: null, riskLevel: null },
    ],
    riskAlerts: [alert('r1', 'high', 'p1'), alert('r2', 'high', 'p1', '2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'), alert('r3', 'high', 'p2'), alert('r4', 'medium', 'p2')],
    doseLogs: [
      { id: 'd1', patientId: 'p1', prescriptionId: null, medicineName: 'm', scheduledAt: '2026-11-12T00:00:00Z', status: 'taken', takenAt: null },
      { id: 'd2', patientId: 'p1', prescriptionId: null, medicineName: 'm', scheduledAt: '2026-11-11T00:00:00Z', status: 'missed', takenAt: null },
      { id: 'd3', patientId: 'p2', prescriptionId: null, medicineName: 'm', scheduledAt: '2026-11-12T00:00:00Z', status: 'taken', takenAt: null },
    ],
  });
  assert.deepEqual(a.visitsPerAsha.map((v) => [v.name, v.visits, v.highRiskVisits]), [['Savitha', 2, 1], ['Meena', 0, 0]]);
  assert.deepEqual(a.highRiskByArea, [{ area: 'Hebbal', open: 1, total: 2 }, { area: 'Yelahanka', open: 1, total: 1 }]);
  assert.deepEqual(a.adherence, { rate: 2 / 3, patientsBelow80: 1, patientsTracked: 2 });
  assert.deepEqual(a.pendingApprovals.map((s) => s.id), ['asha2']);
});
