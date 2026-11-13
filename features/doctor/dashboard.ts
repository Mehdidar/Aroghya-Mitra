/**
 * Doctor dashboard and admin analytics: pure aggregations over the shared
 * tables. The screens fetch rows (RLS limits them to what the user may see)
 * and pass them here.
 */
import type {
  AccessLog,
  AshaVisit,
  Consultation,
  DoseLog,
  Patient,
  Profile,
  Referral,
  RiskAlert,
} from '../records/types.ts';

const IST_MINUTES = 330;

export function localDay(iso: string | Date, tzOffsetMinutes = IST_MINUTES): string {
  const ms = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  return new Date(ms + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

// --- doctor dashboard --------------------------------------------------------

export interface DoctorDashboard {
  todaysPatients: { patientId: string; at: string; via: 'consultation' | 'qr_scan' | 'follow_up' }[];
  recentScans: AccessLog[];
  highRiskAlerts: RiskAlert[];
  stats: {
    patientsToday: number;
    scansToday: number;
    openReferrals: number;
    highRiskOpen: number;
    followUpsDue: number;
  };
}

export function buildDoctorDashboard(input: {
  doctorId: string;
  now: Date;
  consultations: Consultation[];
  accessLogs: AccessLog[];
  referrals: Referral[];
  riskAlerts: RiskAlert[];
}): DoctorDashboard {
  const today = localDay(input.now);
  const mine = input.consultations.filter((c) => c.doctorId === input.doctorId);
  const scans = input.accessLogs
    .filter((l) => l.viewerId === input.doctorId && l.method === 'qr_scan' && l.outcome === 'granted')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const seen = new Map<string, DoctorDashboard['todaysPatients'][number]>();
  const add = (patientId: string, at: string, via: DoctorDashboard['todaysPatients'][number]['via']) => {
    if (!seen.has(patientId)) seen.set(patientId, { patientId, at, via });
  };
  for (const c of mine) if (c.followUpDate === today) add(c.patientId, `${today}T00:00:00.000Z`, 'follow_up');
  for (const c of mine) if (localDay(c.startedAt) === today) add(c.patientId, c.startedAt, 'consultation');
  for (const s of scans) if (localDay(s.createdAt) === today) add(s.patientId, s.createdAt, 'qr_scan');

  const highRisk = input.riskAlerts
    .filter((a) => a.resolvedAt === null && a.level === 'high')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    todaysPatients: [...seen.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    recentScans: scans.slice(0, 10),
    highRiskAlerts: highRisk,
    stats: {
      patientsToday: seen.size,
      scansToday: scans.filter((s) => localDay(s.createdAt) === today).length,
      openReferrals: input.referrals.filter((r) => r.status === 'pending' || r.status === 'seen').length,
      highRiskOpen: highRisk.length,
      followUpsDue: mine.filter((c) => c.followUpDate !== null && c.followUpDate <= today && c.followUpDate >= localDay(new Date(input.now.getTime() - 7 * 86_400_000))).length,
    },
  };
}

// --- patient list ------------------------------------------------------------

export interface PatientFilter {
  search?: string;
  ashaWorkerId?: string | null;
  area?: string;
  condition?: string;
  unassignedOnly?: boolean;
}

/** Search by name, phone or id; filter by ASHA worker, area or chronic condition. */
export function filterPatients(patients: Patient[], f: PatientFilter): Patient[] {
  const q = f.search?.trim().toLowerCase() ?? '';
  const digits = q.replace(/\D/g, '');
  return patients
    .filter((p) => {
      if (q) {
        const hit =
          p.fullName.toLowerCase().includes(q) ||
          p.id.toLowerCase().startsWith(q) ||
          (digits.length >= 4 && (p.phone ?? '').replace(/\D/g, '').includes(digits));
        if (!hit) return false;
      }
      if (f.ashaWorkerId !== undefined && p.ashaWorkerId !== f.ashaWorkerId) return false;
      if (f.unassignedOnly && p.ashaWorkerId !== null) return false;
      if (f.area && (p.area ?? '').toLowerCase() !== f.area.toLowerCase()) return false;
      if (f.condition && !p.chronicConditions.some((c) => c.toLowerCase().includes(f.condition!.toLowerCase())))
        return false;
      return true;
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export type PatientFormError = 'name_required' | 'dob_invalid' | 'phone_invalid' | 'blood_group_invalid';

/** Validation for register / edit patient. Indian mobile: 10 digits starting 6–9, optional +91. */
export function validatePatientForm(p: {
  fullName: string;
  dateOfBirth: string | null;
  phone: string | null;
  bloodGroup: string | null;
}, now: Date): PatientFormError[] {
  const errors: PatientFormError[] = [];
  if (p.fullName.trim().length < 2) errors.push('name_required');
  if (p.dateOfBirth) {
    const t = Date.parse(`${p.dateOfBirth}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth) || Number.isNaN(t) || t > now.getTime() || t < Date.parse('1900-01-01'))
      errors.push('dob_invalid');
  }
  if (p.phone && !/^(\+91)?[6-9]\d{9}$/.test(p.phone.replace(/[\s-]/g, ''))) errors.push('phone_invalid');
  if (p.bloodGroup && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(p.bloodGroup))
    errors.push('blood_group_invalid');
  return errors;
}

// --- admin analytics ---------------------------------------------------------

export interface AdminAnalytics {
  visitsPerAsha: { ashaWorkerId: string; name: string; visits: number; highRiskVisits: number; isActive: boolean }[];
  highRiskByArea: { area: string; open: number; total: number }[];
  adherence: { rate: number | null; patientsBelow80: number; patientsTracked: number };
  pendingApprovals: Profile[];
}

export function buildAdminAnalytics(input: {
  now: Date;
  windowDays?: number;
  staff: Profile[];
  patients: Patient[];
  visits: AshaVisit[];
  riskAlerts: RiskAlert[];
  doseLogs: DoseLog[];
}): AdminAnalytics {
  const from = input.now.getTime() - (input.windowDays ?? 30) * 86_400_000;
  const inWindow = (iso: string) => Date.parse(iso) > from && Date.parse(iso) <= input.now.getTime();
  const areaOf = new Map(input.patients.map((p) => [p.id, p.area ?? 'Unknown']));

  const visitsPerAsha = input.staff
    .filter((s) => s.role === 'asha')
    .map((s) => {
      const v = input.visits.filter((x) => x.ashaWorkerId === s.id && inWindow(x.visitedAt));
      return {
        ashaWorkerId: s.id,
        name: s.fullName,
        visits: v.length,
        highRiskVisits: v.filter((x) => x.riskLevel === 'high').length,
        isActive: s.isActive,
      };
    })
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));

  const areas = new Map<string, { area: string; open: number; total: number }>();
  for (const a of input.riskAlerts) {
    if (a.level !== 'high' || !inWindow(a.createdAt)) continue;
    const area = areaOf.get(a.patientId) ?? 'Unknown';
    const row = areas.get(area) ?? { area, open: 0, total: 0 };
    row.total++;
    if (a.resolvedAt === null) row.open++;
    areas.set(area, row);
  }

  const perPatient = new Map<string, { taken: number; due: number }>();
  for (const d of input.doseLogs) {
    if (d.status === 'pending' || !inWindow(d.scheduledAt)) continue;
    const row = perPatient.get(d.patientId) ?? { taken: 0, due: 0 };
    row.due++;
    if (d.status === 'taken') row.taken++;
    perPatient.set(d.patientId, row);
  }
  let taken = 0;
  let due = 0;
  let below = 0;
  for (const r of perPatient.values()) {
    taken += r.taken;
    due += r.due;
    if (r.taken / r.due < 0.8) below++;
  }

  return {
    visitsPerAsha,
    highRiskByArea: [...areas.values()].sort((a, b) => b.open - a.open || b.total - a.total),
    adherence: { rate: due ? taken / due : null, patientsBelow80: below, patientsTracked: perPatient.size },
    pendingApprovals: input.staff.filter((s) => !s.isActive && (s.role === 'doctor' || s.role === 'asha')),
  };
}
