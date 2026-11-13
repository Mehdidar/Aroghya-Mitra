import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, buildPatientHistory } from '../history.ts';
import type { PatientRecordBundle } from '../repository.ts';
import type { DoseLog } from '../../../features/records/types.ts';
import { NOW, patient, people } from './fixtures.ts';

const day = (n: number, hour = 4) => new Date(NOW.getTime() - n * 86_400_000 + (hour - 10) * 3_600_000).toISOString();

function bundle(overrides: Partial<PatientRecordBundle> = {}): PatientRecordBundle {
  return {
    patient,
    vitals: [],
    ashaVisits: [],
    prescriptions: [],
    doseLogs: [],
    reports: [],
    consultations: [],
    referrals: [],
    riskAlerts: [],
    people: [
      { id: people.doctorA.id, fullName: 'Dr. Anil Kumar', role: 'doctor' },
      { id: people.asha.id, fullName: 'Savitha (ASHA)', role: 'asha' },
    ],
    ...overrides,
  };
}

test('stat cards: blood group, latest weight with trend, heart rate status', () => {
  const h = buildPatientHistory(
    bundle({
      vitals: [
        { id: 'v2', patientId: patient.id, recordedAt: day(1), recordedBy: null, source: 'asha_visit', weightKg: 80, heartRate: 108, systolic: 150, diastolic: 95, spo2: 97 },
        { id: 'v1', patientId: patient.id, recordedAt: day(10), recordedBy: null, source: 'self', weightKg: 82.5, heartRate: 72 },
      ],
    }),
    { now: NOW },
  );
  const card = (k: string) => h.statCards.find((c) => c.key === k)!;
  assert.deepEqual(h.statCards.slice(0, 3).map((c) => c.key), ['blood_group', 'weight', 'heart_rate']);
  assert.equal(card('blood_group').value, 'A+');
  assert.deepEqual([card('weight').value, card('weight').unit, card('weight').trend], ['80', 'kg', 'down']);
  assert.deepEqual([card('heart_rate').value, card('heart_rate').status, card('heart_rate').trend], ['108', 'attention', 'up']);
  assert.deepEqual([card('blood_pressure').value, card('blood_pressure').status], ['150/95', 'attention']);
  assert.equal(card('spo2').status, 'normal');
});

test('stat cards with no vitals show dashes, not zeros', () => {
  const h = buildPatientHistory(bundle({ patient: { ...patient, bloodGroup: null } }), { now: NOW });
  for (const c of h.statCards) {
    assert.equal(c.value, '—', c.key);
    assert.equal(c.status, 'unknown', c.key);
  }
});

test('allergies and conditions are deduplicated and open risk alerts are on top, high first', () => {
  const h = buildPatientHistory(
    bundle({
      riskAlerts: [
        { id: 'r1', patientId: patient.id, ashaWorkerId: people.asha.id, level: 'medium', reason: 'Missed ANC visit', createdAt: day(1), resolvedAt: null },
        { id: 'r2', patientId: patient.id, ashaWorkerId: people.asha.id, level: 'high', reason: 'BP 170/110', createdAt: day(3), resolvedAt: null },
        { id: 'r3', patientId: patient.id, ashaWorkerId: people.asha.id, level: 'high', reason: 'old', createdAt: day(30), resolvedAt: day(29) },
      ],
    }),
    { now: NOW },
  );
  assert.deepEqual(h.alerts.allergies, ['Penicillin', 'Sulfa drugs']);
  assert.deepEqual(h.alerts.chronicConditions, ['Type 2 diabetes', 'Hypertension']);
  assert.deepEqual(h.alerts.openRiskAlerts.map((a) => a.id), ['r2', 'r1']);
});

test('timeline merges every module’s records, newest first, with names', () => {
  const h = buildPatientHistory(
    bundle({
      ashaVisits: [{ id: 'av1', patientId: patient.id, ashaWorkerId: people.asha.id, visitedAt: day(2), notes: 'BP high', riskLevel: 'high' }],
      consultations: [{ id: 'c1', patientId: patient.id, doctorId: people.doctorA.id, facilityId: null, startedAt: day(1), notes: null, diagnosis: 'Hypertension', labOrders: [], followUpDate: null, prescriptionId: 'rx1', referralId: null }],
      prescriptions: [
        { id: 'rx1', patientId: patient.id, prescribedBy: people.doctorA.id, source: 'doctor', issuedAt: day(1, 5), diagnosis: null, items: [{ name: 'Amlodipine 5mg', dosage: '1 tab', frequency: 'OD', durationDays: 30 }], notes: null },
        { id: 'rx0', patientId: patient.id, prescribedBy: null, source: 'scan', issuedAt: day(20), diagnosis: null, items: [{ name: 'Metformin 500mg', dosage: '1 tab', frequency: 'BD', durationDays: null }], notes: null },
      ],
      reports: [{ id: 'rep1', patientId: patient.id, uploadedBy: people.patientUser.id, category: 'blood_test', title: 'HbA1c', storagePath: 'x', mimeType: 'application/pdf', sizeBytes: 1, reportDate: '2026-11-05', createdAt: day(0) }],
    }),
    { now: NOW },
  );
  assert.deepEqual(h.timeline.map((e) => e.kind), ['prescription', 'consultation', 'asha_visit', 'report', 'prescription']);
  const visit = h.timeline.find((e) => e.kind === 'asha_visit')!;
  assert.equal(visit.highRisk, true);
  assert.equal(visit.actorName, 'Savitha (ASHA)');
  assert.equal(h.timeline.find((e) => e.refId === 'rx0')!.title, 'Scanned prescription');
  assert.equal(h.timeline.find((e) => e.kind === 'report')!.title, 'Blood test report');
});

test('vitals series are chronological and skip empty metrics', () => {
  const h = buildPatientHistory(
    bundle({
      vitals: [
        { id: 'b', patientId: patient.id, recordedAt: day(1), recordedBy: null, source: 'self', heartRate: 80 },
        { id: 'a', patientId: patient.id, recordedAt: day(5), recordedBy: null, source: 'self', heartRate: 70, weightKg: 81 },
      ],
    }),
    { now: NOW },
  );
  assert.deepEqual(h.vitals.map((s) => s.metric), ['heartRate', 'weightKg']);
  assert.deepEqual(h.vitals[0]!.points.map((p) => p.value), [70, 80]);
});

test('adherence: rate, worst medicine first, last 7 days, pending and future ignored', () => {
  const dose = (id: string, med: string, d: number, status: DoseLog['status']): DoseLog => ({
    id, patientId: patient.id, prescriptionId: null, medicineName: med, scheduledAt: day(d), status, takenAt: null,
  });
  const h = buildPatientHistory(
    bundle({
      doseLogs: [
        dose('1', 'Metformin', 1, 'taken'),
        dose('2', 'Metformin', 2, 'taken'),
        dose('3', 'Metformin', 3, 'missed'),
        dose('4', 'Amlodipine', 1, 'missed'),
        dose('5', 'Amlodipine', 2, 'skipped'),
        dose('6', 'Amlodipine', 0, 'pending'),
        dose('7', 'Amlodipine', -1, 'taken'), // future: ignored
        dose('8', 'Metformin', 45, 'missed'), // outside 30-day window
      ],
    }),
    { now: NOW },
  );
  assert.deepEqual([h.adherence.taken, h.adherence.missed, h.adherence.skipped], [2, 2, 1]);
  assert.equal(h.adherence.rate, 2 / 5);
  assert.deepEqual(h.adherence.perMedicine.map((m) => [m.medicineName, m.rate]), [['Amlodipine', 0], ['Metformin', 2 / 3]]);
  assert.equal(h.adherence.daily.length, 7);
  assert.equal(h.adherence.daily.at(-1)!.date, '2026-11-13');
  assert.equal(h.adherence.daily.reduce((n, d) => n + d.due, 0), 5);
});

test('age is computed from date of birth', () => {
  assert.equal(ageOn('1980-06-15', NOW), 46);
  assert.equal(ageOn('1980-11-14', NOW), 45);
  assert.equal(ageOn(null, NOW), null);
  assert.equal(ageOn('garbage', NOW), null);
});
