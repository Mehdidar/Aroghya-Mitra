/**
 * Storage for preventive records. Two implementations:
 *  - MemoryPreventionRepository: in-memory, seeded with the labelled demo data
 *    (packages/patient-ai/prevention/demo.ts); lost on restart.
 *  - SupabasePreventionRepository: tables from supabase/migrations/5101_preventive.sql
 *    over PostgREST with the service-role key (access is checked first, in access.ts).
 *
 * Every write is an upsert by id, so a phone re-sending its outbox is harmless.
 * Patient ids are normalised with toDbId, so the ASHA app's local ids
 * ('demo_p3') and database UUIDs name the same person.
 */
import { toDbId } from '../../packages/shared/ids.ts';
import { demoPrevention } from '../../packages/patient-ai/prevention/demo.ts';
import type { GrowthMeasurement, PreventionPerson, ScreeningResult, Sex, VaccinationRecord } from '../../packages/patient-ai/prevention/types.ts';
import type { RestClient } from '../db/rest.ts';

export type Stored<T> = T & { id: string; patientId: string; createdBy?: string | null; createdAt?: string };

export interface PregnancyRecord {
  id: string;
  patientId: string;
  lmp: string;
  gravida?: number | null;
  deliveredOn?: string | null;
  recordedBy?: string | null;
}

export interface PreventionRecords {
  vaccinations: Stored<VaccinationRecord>[];
  growth: Stored<GrowthMeasurement>[];
  screenings: Stored<ScreeningResult>[];
  pregnancy: PregnancyRecord | null;
}

/** Details the records repository does not hold (demo subjects that live only in the ASHA caseload). */
export interface PreventionSubject {
  patientId: string;
  name: string;
  ashaWorkerId: string | null;
  dob: string | null;
  sex: Sex | null;
  conditions: string[];
  birthWeightKg: number | null;
  homeVisits: string[];
  childIds: string[];
  demo: boolean;
}

export interface PreventionRepository {
  readonly backend: 'memory' | 'supabase';
  getSubject(patientId: string): Promise<PreventionSubject | null>;
  listRecords(patientId: string): Promise<PreventionRecords>;
  saveVaccination(r: Stored<VaccinationRecord>): Promise<Stored<VaccinationRecord>>;
  saveGrowth(r: Stored<GrowthMeasurement>): Promise<Stored<GrowthMeasurement>>;
  saveScreening(r: Stored<ScreeningResult>): Promise<Stored<ScreeningResult>>;
  savePregnancy(r: PregnancyRecord): Promise<PregnancyRecord>;
}

const key = (id: string) => toDbId(id);

function upsert<T extends { id: string }>(list: T[], row: T): T {
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
  return row;
}

export interface MemoryPreventionData {
  subjects: PreventionSubject[];
  vaccinations: Stored<VaccinationRecord>[];
  growth: Stored<GrowthMeasurement>[];
  screenings: Stored<ScreeningResult>[];
  pregnancies: PregnancyRecord[];
}

/** The demo cast's preventive records (fictional, labelled demo). */
export function demoPreventionData(now: Date | string = new Date()): MemoryPreventionData {
  const data: MemoryPreventionData = { subjects: [], vaccinations: [], growth: [], screenings: [], pregnancies: [] };
  for (const s of demoPrevention(now)) {
    const p: PreventionPerson = s.person;
    const pid = key(s.patientId);
    data.subjects.push({ patientId: pid, name: s.name, ashaWorkerId: s.ashaWorkerId, dob: p.dob, sex: p.sex, conditions: p.conditions ?? [], birthWeightKg: p.birthWeightKg ?? null, homeVisits: p.homeVisits ?? [], childIds: s.childIds.map(key), demo: true });
    for (const v of p.vaccinations ?? []) data.vaccinations.push({ ...v, id: v.id!, patientId: pid });
    for (const g of p.growth ?? []) data.growth.push({ ...g, id: g.id!, patientId: pid });
    for (const r of p.screenings ?? []) data.screenings.push({ ...r, id: r.id!, patientId: pid });
    if (p.pregnancy) data.pregnancies.push({ id: `demo-preg-${pid}`, patientId: pid, lmp: p.pregnancy.lmp, gravida: p.pregnancy.gravida ?? null, deliveredOn: null });
  }
  return data;
}

export class MemoryPreventionRepository implements PreventionRepository {
  readonly backend = 'memory' as const;
  readonly data: MemoryPreventionData;
  constructor(data: MemoryPreventionData = demoPreventionData()) {
    this.data = data;
  }
  async getSubject(patientId: string) {
    return this.data.subjects.find((s) => s.patientId === key(patientId)) ?? null;
  }
  async listRecords(patientId: string): Promise<PreventionRecords> {
    const pid = key(patientId);
    const mine = <T extends { patientId: string }>(rows: T[]) => rows.filter((r) => r.patientId === pid);
    const pregnancies = mine(this.data.pregnancies).sort((a, b) => (a.lmp < b.lmp ? 1 : -1));
    return { vaccinations: mine(this.data.vaccinations), growth: mine(this.data.growth), screenings: mine(this.data.screenings), pregnancy: pregnancies[0] ?? null };
  }
  async saveVaccination(r: Stored<VaccinationRecord>) {
    return upsert(this.data.vaccinations, { ...r, patientId: key(r.patientId) });
  }
  async saveGrowth(r: Stored<GrowthMeasurement>) {
    return upsert(this.data.growth, { ...r, patientId: key(r.patientId) });
  }
  async saveScreening(r: Stored<ScreeningResult>) {
    return upsert(this.data.screenings, { ...r, patientId: key(r.patientId) });
  }
  async savePregnancy(r: PregnancyRecord) {
    return upsert(this.data.pregnancies, { ...r, patientId: key(r.patientId) });
  }
}

// ------------------------------------------------------------------ Supabase

type VaxRow = { id: string; patient_id: string; vaccine_code: string; dose: number; given_on: string; given_by: string | null; batch: string | null; source: VaccinationRecord['source']; created_by: string | null };
type GrowthRow = { id: string; patient_id: string; measured_on: string; weight_kg: number | string | null; height_cm: number | string | null; muac_cm: number | string | null; measured_by: string | null };
type ScreenRow = { id: string; patient_id: string; kind: ScreeningResult['kind']; value: Record<string, unknown>; screened_on: string; screened_by: string | null };
type PregRow = { id: string; patient_id: string; lmp: string; gravida: number | null; delivered_on: string | null; recorded_by: string | null };

const n = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));
/** A profile id or null: PostgREST rejects a non-UUID in a uuid column. */
const profileId = (id: string | null | undefined) => (id ? toDbId(id) : null);

export class SupabasePreventionRepository implements PreventionRepository {
  readonly backend = 'supabase' as const;
  private readonly db: RestClient;
  constructor(db: RestClient) {
    this.db = db;
  }
  /** No extra subject data in the database: dob/sex come from patients, pregnancy from `pregnancies`. */
  async getSubject(): Promise<PreventionSubject | null> {
    return null;
  }
  async listRecords(patientId: string): Promise<PreventionRecords> {
    const f = { patient_id: `eq.${key(patientId)}` };
    const [vax, growth, scr, preg] = await Promise.all([
      this.db.select<VaxRow>('vaccination_records', f, { order: 'given_on.asc' }),
      this.db.select<GrowthRow>('growth_measurements', f, { order: 'measured_on.asc' }),
      this.db.select<ScreenRow>('screening_results', f, { order: 'screened_on.asc' }),
      this.db.select<PregRow>('pregnancies', f, { order: 'lmp.desc', limit: 1 }),
    ]);
    return {
      vaccinations: vax.map((r) => ({ id: r.id, patientId: r.patient_id, vaccineCode: r.vaccine_code, dose: r.dose, givenOn: r.given_on, givenBy: r.given_by, batch: r.batch, source: r.source, createdBy: r.created_by })),
      growth: growth.map((r) => ({ id: r.id, patientId: r.patient_id, measuredOn: r.measured_on, weightKg: n(r.weight_kg), heightCm: n(r.height_cm), muacCm: n(r.muac_cm), measuredBy: r.measured_by })),
      screenings: scr.map((r) => ({ id: r.id, patientId: r.patient_id, kind: r.kind, value: r.value ?? {}, screenedOn: r.screened_on, by: r.screened_by })),
      pregnancy: preg[0] ? { id: preg[0].id, patientId: preg[0].patient_id, lmp: preg[0].lmp, gravida: preg[0].gravida, deliveredOn: preg[0].delivered_on, recordedBy: preg[0].recorded_by } : null,
    };
  }
  async saveVaccination(r: Stored<VaccinationRecord>) {
    await this.db.upsert('vaccination_records', { id: key(r.id), patient_id: key(r.patientId), vaccine_code: r.vaccineCode, dose: r.dose, given_on: r.givenOn, given_by: profileId(r.givenBy), batch: r.batch ?? null, source: r.source, created_by: profileId(r.createdBy) }, 'id');
    return r;
  }
  async saveGrowth(r: Stored<GrowthMeasurement>) {
    await this.db.upsert('growth_measurements', { id: key(r.id), patient_id: key(r.patientId), measured_on: r.measuredOn, weight_kg: r.weightKg ?? null, height_cm: r.heightCm ?? null, muac_cm: r.muacCm ?? null, measured_by: profileId(r.measuredBy) }, 'id');
    return r;
  }
  async saveScreening(r: Stored<ScreeningResult>) {
    await this.db.upsert('screening_results', { id: key(r.id), patient_id: key(r.patientId), kind: r.kind, value: r.value, screened_on: r.screenedOn, screened_by: profileId(r.by) }, 'id');
    return r;
  }
  async savePregnancy(r: PregnancyRecord) {
    await this.db.upsert('pregnancies', { id: key(r.id), patient_id: key(r.patientId), lmp: r.lmp, gravida: r.gravida ?? null, delivered_on: r.deliveredOn ?? null, recorded_by: profileId(r.recordedBy) }, 'id');
    return r;
  }
}
