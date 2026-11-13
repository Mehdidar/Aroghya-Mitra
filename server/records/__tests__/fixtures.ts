import type { Patient, Profile } from '../../../packages/records/records/types.ts';
import { MemoryRecordsRepository } from '../memoryRepository.ts';

export const NOW = new Date('2026-11-13T10:00:00.000Z');
export const SECRET = 'test-secret-that-is-at-least-32-bytes-long!!';

export const FAC_A = 'fac-a';
export const FAC_B = 'fac-b';

const profile = (id: string, role: Profile['role'], facilityId: string | null, isActive = true): Profile => ({
  id,
  role,
  fullName: `Name ${id}`,
  facilityId,
  isActive,
});

export const people = {
  patientUser: profile('u-patient', 'patient', null),
  otherPatientUser: profile('u-patient-2', 'patient', null),
  doctorA: profile('u-doc-a', 'doctor', FAC_A),
  doctorB: profile('u-doc-b', 'doctor', FAC_B),
  doctorB2: profile('u-doc-b2', 'doctor', FAC_B),
  inactiveDoctorB: profile('u-doc-b-off', 'doctor', FAC_B, false),
  adminA: profile('u-admin-a', 'admin', FAC_A),
  adminB: profile('u-admin-b', 'admin', FAC_B),
  asha: profile('u-asha', 'asha', FAC_A),
};

export const patient: Patient = {
  id: 'pat-1',
  userId: people.patientUser.id,
  fullName: 'Lakshmi Devi',
  dateOfBirth: '1980-06-15',
  sex: 'female',
  phone: null,
  facilityId: FAC_A,
  ashaWorkerId: people.asha.id,
  area: 'Hebbal',
  bloodGroup: 'A+',
  allergies: ['Penicillin', ' penicillin ', 'Sulfa drugs'],
  chronicConditions: ['Type 2 diabetes', 'Hypertension'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

export function makeRepo(opts: { shareHistory?: boolean } = {}): MemoryRecordsRepository {
  return new MemoryRecordsRepository({
    profiles: Object.values(people),
    patients: [patient],
    consents:
      opts.shareHistory === undefined
        ? []
        : [{ patientId: patient.id, shareHistory: opts.shareHistory, updatedAt: NOW.toISOString() }],
  });
}

export const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
