/**
 * The one demo cast, shared by every module, so the demo flow joins up:
 * the pregnant patient with high blood pressure in Sunita's ASHA caseload is
 * the same person who signs in as the demo patient, whose QR history and
 * prescriptions the doctor opens, and whose referral sits in Dr Rao's inbox.
 *
 * Names are fictional. IDs are fixed UUIDs so seeds on every device agree.
 */
import type { Facility, Profile, Role } from './types.ts';

export const DEMO_FACILITY: Facility = {
  id: '11111111-1111-4111-8111-000000000001',
  name: 'PHC Hebbal',
  kind: 'phc',
  area: 'Hebbal, Bengaluru',
};

export const DEMO_IDS = {
  patient: '22222222-2222-4222-8222-000000000001', // Rekha Kumari: pregnant, 34 weeks, high BP
  asha: '22222222-2222-4222-8222-000000000002',
  doctor: '22222222-2222-4222-8222-000000000003',
  admin: '22222222-2222-4222-8222-000000000004',
  /** The patients.id row for Rekha (distinct from her sign-in profile id, as in the schema). */
  patientRecord: '33333333-3333-4333-8333-000000000001',
  referral: '44444444-4444-4444-8444-000000000001',
  prescriptionDoctor: '55555555-5555-4555-8555-000000000001',
  prescriptionScan: '55555555-5555-4555-8555-000000000002',
  consultation: '66666666-6666-4666-8666-000000000001',
} as const;

export const DEMO_USERS: Record<Role, { id: string; name: string; phone: string }> = {
  patient: { id: DEMO_IDS.patient, name: 'Rekha Kumari', phone: '+91 98000 00001' },
  asha: { id: DEMO_IDS.asha, name: 'Sunita Devi', phone: '+91 99000 23456' },
  doctor: { id: DEMO_IDS.doctor, name: 'Dr. Arjun Rao', phone: '+91 98861 34567' },
  admin: { id: DEMO_IDS.admin, name: 'Meena Shetty', phone: '+91 97400 45678' },
};

export const DEMO_PROFILES: Profile[] = (['patient', 'asha', 'doctor', 'admin'] as const).map((role) => ({
  id: DEMO_USERS[role].id,
  role,
  fullName: DEMO_USERS[role].name,
  facilityId: role === 'patient' ? null : DEMO_FACILITY.id,
  isActive: true,
}));
