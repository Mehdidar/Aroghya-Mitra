/**
 * Loads the linked demo dataset (Rekha Kumari, Sunita Devi, Dr. Arjun Rao,
 * Meena Shetty, PHC Hebbal) into a Supabase database. Idempotent: every row
 * is an upsert by id, so running it twice changes nothing.
 *
 * The four demo people need auth.users rows first (profiles.id references
 * auth.users). `ensureAuthUsers` creates them through the GoTrue admin API with
 * the fixed demo ids; a local test database can insert them with SQL instead.
 */
import { DEMO_FACILITY, DEMO_IDS, DEMO_USERS } from '../../packages/shared/demo.ts';
import type { Role } from '../../packages/shared/types.ts';
import { demoMemoryData } from '../records/demoSeed.ts';
import { SupabaseRecordsRepository, patientRow, referralRow } from '../records/supabaseRepository.ts';
import { toDbId } from '../../packages/shared/ids.ts';
import { DbError, type RestClient } from './rest.ts';

const ROLES: Role[] = ['patient', 'asha', 'doctor', 'admin'];
const e164 = (phone: string) => phone.replace(/[^\d+]/g, '');

/** Creates (or confirms) the four demo auth users with their fixed ids. */
export async function ensureAuthUsers(supabaseUrl: string, serviceKey: string, fetchImpl: typeof fetch = fetch): Promise<{ created: number; existing: number }> {
  const base = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`;
  const headers: Record<string, string> = { apikey: serviceKey, 'content-type': 'application/json' };
  if (serviceKey.startsWith('eyJ')) headers.authorization = `Bearer ${serviceKey}`;
  let created = 0;
  let existing = 0;
  for (const role of ROLES) {
    const u = DEMO_USERS[role];
    const got = await fetchImpl(`${base}/${u.id}`, { headers });
    if (got.ok) {
      existing++;
      continue;
    }
    const res = await fetchImpl(base, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: u.id,
        phone: e164(u.phone),
        phone_confirm: true,
        app_metadata: { role },
        user_metadata: { full_name: u.name, demo: true },
      }),
    });
    if (!res.ok) throw new DbError(res.status, `could not create demo ${role} user: ${(await res.text()).slice(0, 200)}`);
    created++;
  }
  return { created, existing };
}

export interface SeedSummary {
  [table: string]: number;
}

export async function seedDemo(db: RestClient, now = new Date()): Promise<SeedSummary> {
  const d = demoMemoryData(now);
  const repo = new SupabaseRecordsRepository(db);
  const out: SeedSummary = {};
  const count = (k: string, n: number) => (out[k] = (out[k] ?? 0) + n);

  await db.upsert('facilities', { id: DEMO_FACILITY.id, name: DEMO_FACILITY.name, kind: DEMO_FACILITY.kind, area: DEMO_FACILITY.area }, 'id');
  count('facilities', 1);

  await db.upsert(
    'profiles',
    d.profiles.map((p) => ({ id: p.id, role: p.role, full_name: p.fullName, phone: e164(DEMO_USERS[p.role].phone), facility_id: p.facilityId, is_active: p.isActive })),
    'id',
  );
  count('profiles', d.profiles.length);

  await db.upsert('patients', d.patients.map((p) => ({ ...patientRow(p), categories: ['pregnant'] })), 'id');
  count('patients', d.patients.length);

  for (const c of d.consents) await repo.setConsent(c.patientId, c.shareHistory, new Date(c.updatedAt));
  count('patient_consents', d.consents.length);

  for (const v of d.vitals) await repo.saveVitals(v);
  count('vitals', d.vitals.length);
  for (const p of d.prescriptions) await repo.savePrescription(p);
  count('prescriptions', d.prescriptions.length);
  for (const r of d.reports) await repo.saveReport(r);
  count('health_reports', d.reports.length);

  await db.upsert(
    'dose_logs',
    d.doseLogs.map((x) => ({ id: toDbId(x.id), patient_id: toDbId(x.patientId), prescription_id: x.prescriptionId ? toDbId(x.prescriptionId) : null, medicine_name: x.medicineName, scheduled_at: x.scheduledAt, status: x.status, taken_at: x.takenAt })),
    'id',
  );
  count('dose_logs', d.doseLogs.length);

  await db.upsert(
    'asha_visits',
    d.ashaVisits.map((v) => ({ id: toDbId(v.id), patient_id: toDbId(v.patientId), asha_id: v.ashaWorkerId, visited_at: v.visitedAt, status: v.riskLevel === 'high' ? 'referred' : 'completed', notes: v.notes, source: 'manual', updated_at: v.visitedAt })),
    'id',
  );
  count('asha_visits', d.ashaVisits.length);

  await db.upsert(
    'risk_alerts',
    d.riskAlerts.map((a) => ({
      id: a.id,
      patient_id: toDbId(a.patientId),
      visit_id: toDbId(`demo_visit_${a.patientId}`),
      asha_id: a.ashaWorkerId,
      rule_id: 'preg_severe_htn',
      severity: a.level === 'high' ? 'critical' : 'medium',
      reason: a.reason,
      reason_key: 'risk.preg_severe_htn',
      source: 'demo',
      verified_by: 'server',
      created_at: a.createdAt,
    })),
    'id',
  );
  count('risk_alerts', d.riskAlerts.length);

  await db.upsert('referrals', d.referrals.map((r) => ({ ...referralRow(r), urgency: 'emergency', alert_ids: r.riskAlertId ? [r.riskAlertId] : [] })), 'id');
  count('referrals', d.referrals.length);

  for (const c of d.consultations) await repo.saveConsultation(c);
  count('consultations', d.consultations.length);

  return out;
}

export const DEMO_PATIENT_ID = DEMO_IDS.patientRecord;
