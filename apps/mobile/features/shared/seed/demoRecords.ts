/**
 * The linked demo dataset: Rekha Kumari's records, as the patient app, the
 * doctor's dashboard and the records history all see them. Her ASHA caseload
 * row (features/asha/data/seed.ts) uses the same ids from @am/shared/demo.
 *
 * Everything here is fictional and labelled as demo data on screen.
 */
import {
  DEMO_FACILITY,
  DEMO_IDS,
  DEMO_USERS,
  type Consultation,
  type DoseLog,
  type HealthReport,
  type Patient,
  type Prescription,
  type RecordReferral,
  type RecordRiskAlert,
  type VitalsReading,
} from '@am/shared';

const daysAgo = (d: number, hour = 9, now = new Date()) => {
  const x = new Date(now);
  x.setDate(x.getDate() - d);
  x.setHours(hour, 0, 0, 0);
  return x.toISOString();
};
const dateOnly = (iso: string) => iso.slice(0, 10);

export function buildDemoRecords(now = new Date()) {
  const patient: Patient = {
    id: DEMO_IDS.patientRecord,
    userId: DEMO_IDS.patient,
    fullName: DEMO_USERS.patient.name,
    dateOfBirth: dateOnly(daysAgo(24 * 365 + 40, 9, now)),
    sex: 'female',
    phone: DEMO_USERS.patient.phone,
    facilityId: DEMO_FACILITY.id,
    ashaWorkerId: DEMO_IDS.asha,
    area: 'Rampur',
    bloodGroup: 'B+',
    allergies: ['Penicillin'],
    chronicConditions: ['Gestational hypertension'],
    createdAt: daysAgo(200, 9, now),
  };

  // The ASHA's visit yesterday found BP 150/100 with headache and swelling: the same numbers her caseload card shows.
  const vitals: VitalsReading[] = [
    { id: 'vit-1', patientId: patient.id, recordedAt: daysAgo(1, 10, now), recordedBy: DEMO_IDS.asha, source: 'asha_visit', systolic: 150, diastolic: 100, weightKg: 58, heartRate: 92 },
    { id: 'vit-2', patientId: patient.id, recordedAt: daysAgo(15, 10, now), recordedBy: DEMO_IDS.asha, source: 'asha_visit', systolic: 134, diastolic: 88, weightKg: 57 },
    { id: 'vit-3', patientId: patient.id, recordedAt: daysAgo(43, 11, now), recordedBy: DEMO_IDS.doctor, source: 'consultation', systolic: 128, diastolic: 84, weightKg: 56, spo2: 98 },
  ];

  const prescriptions: Prescription[] = [
    {
      id: DEMO_IDS.prescriptionDoctor,
      patientId: patient.id,
      prescribedBy: DEMO_IDS.doctor,
      source: 'doctor',
      issuedAt: daysAgo(43, 11, now),
      diagnosis: 'Gestational hypertension, 28 weeks',
      items: [
        { name: 'Labetalol 100 mg', dosage: '1 tablet', frequency: 'Twice a day', timesOfDay: ['morning', 'night'], durationDays: 60, instructions: 'After food' },
        { name: 'Iron + folic acid', dosage: '1 tablet', frequency: 'Once a day', timesOfDay: ['afternoon'], durationDays: 90, instructions: 'After lunch, not with tea' },
        { name: 'Calcium 500 mg', dosage: '1 tablet', frequency: 'Once a day', timesOfDay: ['night'], durationDays: 90, instructions: null },
      ],
      notes: 'Check BP at every ASHA visit. Come immediately if headache, blurred vision or swelling.',
    },
    {
      id: DEMO_IDS.prescriptionScan,
      patientId: patient.id,
      prescribedBy: null,
      source: 'scan',
      issuedAt: daysAgo(120, 9, now),
      diagnosis: null,
      items: [{ name: 'Paracetamol 500 mg', dosage: '1 tablet', frequency: 'When needed', timesOfDay: [], durationDays: 3, instructions: 'Fever only, max 3 a day' }],
      notes: 'Scanned from a paper prescription',
    },
  ];

  // Doses: yesterday fully taken, today morning taken, the rest pending.
  const doseLogs: DoseLog[] = [];
  const slots: [string, number][] = [['Labetalol 100 mg', 8], ['Iron + folic acid', 14], ['Labetalol 100 mg', 21], ['Calcium 500 mg', 21]];
  for (let d = 6; d >= 0; d--) {
    for (const [medicineName, hour] of slots) {
      const scheduledAt = daysAgo(d, hour, now);
      const past = new Date(scheduledAt).getTime() < now.getTime();
      const missed = d === 3 && hour === 21 && medicineName === 'Calcium 500 mg';
      doseLogs.push({
        id: `dose-${d}-${hour}-${medicineName.split(' ')[0].toLowerCase()}`,
        patientId: patient.id,
        prescriptionId: DEMO_IDS.prescriptionDoctor,
        medicineName,
        scheduledAt,
        status: !past ? 'pending' : missed ? 'missed' : 'taken',
        takenAt: past && !missed ? scheduledAt : null,
      });
    }
  }

  const reports: HealthReport[] = [
    { id: 'rep-1', patientId: patient.id, uploadedBy: DEMO_IDS.patient, category: 'blood_test', title: 'Haemoglobin, urine protein', storagePath: `${patient.id}/cbc.pdf`, mimeType: 'application/pdf', sizeBytes: 182_000, reportDate: dateOnly(daysAgo(16, 9, now)), createdAt: daysAgo(16, 12, now) },
    { id: 'rep-2', patientId: patient.id, uploadedBy: DEMO_IDS.doctor, category: 'imaging', title: 'Antenatal ultrasound, 28 weeks', storagePath: `${patient.id}/usg-28w.jpg`, mimeType: 'image/jpeg', sizeBytes: 2_400_000, reportDate: dateOnly(daysAgo(43, 9, now)), createdAt: daysAgo(43, 12, now) },
  ];

  const consultations: Consultation[] = [
    {
      id: DEMO_IDS.consultation,
      patientId: patient.id,
      doctorId: DEMO_IDS.doctor,
      facilityId: DEMO_FACILITY.id,
      startedAt: daysAgo(43, 11, now),
      notes: 'BP raised at 28 weeks, no proteinuria. Started labetalol. Fortnightly ASHA BP checks.',
      diagnosis: 'Gestational hypertension',
      labOrders: ['Urine protein', 'CBC', 'LFT'],
      followUpDate: dateOnly(daysAgo(-7, 9, now)),
      prescriptionId: DEMO_IDS.prescriptionDoctor,
      referralId: null,
    },
  ];

  // Sunita referred Rekha after yesterday's visit: this is what sits in Dr Rao's inbox.
  const referrals: RecordReferral[] = [
    {
      id: DEMO_IDS.referral,
      patientId: patient.id,
      fromAshaId: DEMO_IDS.asha,
      toDoctorId: DEMO_IDS.doctor,
      toFacilityId: DEMO_FACILITY.id,
      reason: 'BP 150/100 at 34 weeks with severe headache and swelling of face and hands. Possible pre-eclampsia.',
      riskAlertId: `${patient.id}:preg_severe_htn:demo_visit_${patient.id}`,
      status: 'pending',
      createdAt: daysAgo(1, 11, now),
      seenAt: null,
      acceptedAt: null,
    },
  ];

  const riskAlerts: RecordRiskAlert[] = [
    { id: `${patient.id}:preg_severe_htn`, patientId: patient.id, ashaWorkerId: DEMO_IDS.asha, level: 'high', reason: 'BP 150/100 with severe headache and swelling at 34 weeks', createdAt: daysAgo(1, 10, now), resolvedAt: null },
  ];

  return { patient, vitals, prescriptions, doseLogs, reports, consultations, referrals, riskAlerts };
}

export type DemoRecords = ReturnType<typeof buildDemoRecords>;
