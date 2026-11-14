/**
 * The server's copy of the linked demo dataset (Rekha Kumari), mirroring
 * apps/mobile/features/shared/seed/demoRecords.ts so the doctor's QR scan
 * returns the same history the patient sees on their phone.
 *
 * One in-memory repository per process; tests build their own with
 * `demoMemoryData()`. Fictional data, labelled demo in every screen.
 */
import { DEMO_FACILITY, DEMO_IDS, DEMO_PROFILES, DEMO_USERS } from '../../packages/shared/demo.ts';
import type {
  Consultation,
  DoseLog,
  HealthReport,
  Patient,
  Prescription,
  Profile,
  RecordReferral,
  RecordRiskAlert,
  VitalsReading,
} from '../../packages/shared/types.ts';
import { RestClient, restConfigFromEnv } from '../db/rest.ts';
import { MemoryRecordsRepository, type MemoryData } from './memoryRepository.ts';
import { SupabaseRecordsRepository } from './supabaseRepository.ts';
import type { LabResult, RecordsRepository } from './repository.ts';

const daysAgo = (d: number, hour: number, now: Date) => {
  const x = new Date(now);
  x.setDate(x.getDate() - d);
  x.setHours(hour, 0, 0, 0);
  return x.toISOString();
};
const dateOnly = (iso: string) => iso.slice(0, 10);

/** Demo auth callers (`demo-<role>`) map to the demo cast; real ids pass through. */
export function resolveCallerId(id: string, role: Profile['role']): string {
  return id === `demo-${role}` ? DEMO_USERS[role].id : id;
}

export function demoMemoryData(now = new Date()): MemoryData {
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
  // DEMO lab values typed from rep-1 and an earlier antenatal test (fictional): Hb falling, urine protein newly trace.
  const labResults: LabResult[] = [
    { id: 'lab-hb-1', patientId: patient.id, reportId: null, testCode: 'hb', testName: 'Haemoglobin', value: 10.2, unit: 'g/dL', referenceLow: 11, referenceHigh: 15, observedAt: `${dateOnly(daysAgo(44, 9, now))}T00:00:00.000Z`, enteredBy: DEMO_IDS.doctor, source: 'manual', createdAt: daysAgo(43, 12, now) },
    { id: 'lab-up-1', patientId: patient.id, reportId: null, testCode: 'urine_protein', testName: 'Urine protein (dipstick)', value: 0, unit: 'grade', referenceLow: null, referenceHigh: 0, observedAt: `${dateOnly(daysAgo(44, 9, now))}T00:00:00.000Z`, enteredBy: DEMO_IDS.doctor, source: 'manual', createdAt: daysAgo(43, 12, now) },
    { id: 'lab-hb-2', patientId: patient.id, reportId: 'rep-1', testCode: 'hb', testName: 'Haemoglobin', value: 9.6, unit: 'g/dL', referenceLow: 11, referenceHigh: 15, observedAt: `${dateOnly(daysAgo(16, 9, now))}T00:00:00.000Z`, enteredBy: DEMO_IDS.doctor, source: 'manual', createdAt: daysAgo(16, 12, now) },
    { id: 'lab-up-2', patientId: patient.id, reportId: 'rep-1', testCode: 'urine_protein', testName: 'Urine protein (dipstick)', value: 1, unit: 'grade', referenceLow: null, referenceHigh: 0, observedAt: `${dateOnly(daysAgo(16, 9, now))}T00:00:00.000Z`, enteredBy: DEMO_IDS.doctor, source: 'manual', createdAt: daysAgo(16, 12, now) },
  ];
  const riskAlerts: RecordRiskAlert[] = [
    { id: `${patient.id}:preg_severe_htn`, patientId: patient.id, ashaWorkerId: DEMO_IDS.asha, level: 'high', reason: 'BP 150/100 with severe headache and swelling at 34 weeks', createdAt: daysAgo(1, 10, now), resolvedAt: null },
  ];
  return {
    profiles: DEMO_PROFILES,
    patients: [patient],
    consents: [{ patientId: patient.id, shareHistory: true, updatedAt: daysAgo(200, 9, now) }],
    grants: [],
    redemptions: [],
    accessLogs: [],
    vitals,
    ashaVisits: [
      { id: `demo_visit_${patient.id}`, patientId: patient.id, ashaWorkerId: DEMO_IDS.asha, visitedAt: daysAgo(1, 10, now), notes: 'Severe headache, swelling of face and hands. Referred.', riskLevel: 'high' },
      { id: 'demo_visit_2', patientId: patient.id, ashaWorkerId: DEMO_IDS.asha, visitedAt: daysAgo(15, 10, now), notes: 'Routine antenatal check.', riskLevel: 'medium' },
    ],
    prescriptions,
    doseLogs,
    reports,
    consultations,
    referrals,
    riskAlerts,
    labResults,
  };
}

let shared: RecordsRepository | null = null;

/**
 * The process-wide records repository: Supabase when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set, otherwise the in-memory demo data
 * (seeded once, lost on restart).
 */
export function getDemoRepository(): RecordsRepository {
  if (!shared) {
    const cfg = restConfigFromEnv();
    shared = cfg ? new SupabaseRecordsRepository(new RestClient(cfg)) : new MemoryRecordsRepository(demoMemoryData());
  }
  return shared;
}

/** Which store the server is using, for /health and the start-up log. */
export const recordsBackend = (): 'supabase' | 'memory' => (restConfigFromEnv() ? 'supabase' : 'memory');

/** The patient record owned by this user id, if any. */
export function patientRecordFor(repo: RecordsRepository, userId: string): Promise<Patient | null> {
  return repo.findPatientByUser(userId);
}
