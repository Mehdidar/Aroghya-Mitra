/** Builds the person the plan engine needs from the stored records, and validates incoming records. */
import { preventionPlan } from '../../packages/patient-ai/prevention/engine.ts';
import { VACCINE_CODES } from '../../packages/patient-ai/prevention/guidelines/uip.ts';
import type { PreventionPerson, PreventionPlan, ScreeningKind, ScreeningResult, Sex } from '../../packages/patient-ai/prevention/types.ts';
import type { Patient, VitalsReading } from '../../packages/shared/types.ts';
import type { PreventionRecords, PreventionSubject } from './repository.ts';

const day = (iso: string) => iso.slice(0, 10);

/** BP and sugar readings from the shared vitals (ASHA visits, consultations, self checks) count as screenings too. */
export function vitalsAsScreenings(vitals: VitalsReading[]): ScreeningResult[] {
  const out: ScreeningResult[] = [];
  for (const v of vitals) {
    if (typeof v.systolic === 'number' && typeof v.diastolic === 'number') out.push({ id: `vitals:${v.id}:bp`, kind: 'bp', screenedOn: day(v.recordedAt), by: v.recordedBy, value: { systolic: v.systolic, diastolic: v.diastolic, from: 'vitals' } });
    if (typeof v.bloodSugarMgDl === 'number') out.push({ id: `vitals:${v.id}:sugar`, kind: 'sugar', screenedOn: day(v.recordedAt), by: v.recordedBy, value: { mgdl: v.bloodSugarMgDl, from: 'vitals' } });
  }
  return out;
}

/** Same kind, same day, same numbers: one reading. */
function dedupe(rows: ScreeningResult[]): ScreeningResult[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.kind}|${r.screenedOn}|${JSON.stringify({ s: r.value.systolic, d: r.value.diastolic, m: r.value.mgdl, g: r.value.gdl })}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const SEX: Record<string, Sex> = { female: 'female', male: 'male', other: 'other', F: 'female', M: 'male' };

export function personFrom(patient: Patient | null, subject: PreventionSubject | null, records: PreventionRecords, vitals: VitalsReading[] = []): PreventionPerson {
  const dob = patient?.dateOfBirth ?? subject?.dob ?? null;
  const birthGrowth = dob ? records.growth.find((g) => g.measuredOn === dob && typeof g.weightKg === 'number') : undefined;
  const preg = records.pregnancy;
  const open = preg && !preg.deliveredOn ? preg : null;
  return {
    id: patient?.id ?? subject?.patientId,
    dob,
    sex: (patient?.sex && SEX[patient.sex]) || subject?.sex || null,
    pregnancy: open ? { lmp: open.lmp, gravida: open.gravida ?? undefined } : null,
    deliveredOn: preg?.deliveredOn ?? null,
    birthWeightKg: subject?.birthWeightKg ?? birthGrowth?.weightKg ?? null,
    conditions: [...new Set([...(patient?.chronicConditions ?? []), ...(subject?.conditions ?? [])])],
    homeVisits: subject?.homeVisits ?? [],
    vaccinations: records.vaccinations,
    growth: records.growth.filter((g) => !(birthGrowth && g.id === birthGrowth.id)),
    screenings: dedupe([...records.screenings, ...vitalsAsScreenings(vitals)]),
  };
}

export function planFor(person: PreventionPerson, now: Date): PreventionPlan {
  return preventionPlan(person, now);
}

// ----------------------------------------------------------------- validation

export class RecordError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RecordError';
    this.status = status;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RECORD_KINDS = ['vaccination', 'growth', 'screening', 'pregnancy'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
const SCREENING_KINDS: ScreeningKind[] = ['bp', 'sugar', 'hb', 'oral', 'breast', 'cervical', 'anc', 'ultrasound'];

function date(v: unknown, field: string, today: string, dob: string | null, opts: { allowFuture?: boolean } = {}): string {
  if (typeof v !== 'string' || !DATE.test(v.slice(0, 10)) || Number.isNaN(Date.parse(v.slice(0, 10)))) throw new RecordError(`${field} must be a date (YYYY-MM-DD)`);
  const d = v.slice(0, 10);
  if (!opts.allowFuture && d > today) throw new RecordError(`${field} is in the future`);
  if (dob && d < dob) throw new RecordError(`${field} is before the date of birth`);
  return d;
}

function range(v: unknown, field: string, min: number, max: number, optional = false): number | null {
  if (v === undefined || v === null || v === '') {
    if (optional) return null;
    throw new RecordError(`${field} is required`);
  }
  const x = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(x) || x < min || x > max) throw new RecordError(`${field} must be between ${min} and ${max}`);
  return Math.round(x * 100) / 100;
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Checks and normalises one record's fields. Throws RecordError (400) on bad input. */
export function validateRecord(kind: RecordKind, r: Record<string, unknown>, today: string, dob: string | null) {
  switch (kind) {
    case 'vaccination': {
      const code = String(r.vaccineCode ?? '');
      if (!VACCINE_CODES.includes(code)) throw new RecordError(`Unknown vaccine code: ${code || '(none)'}`);
      const dose = range(r.dose, 'dose', 0, 20)!;
      if (!Number.isInteger(dose)) throw new RecordError('dose must be a whole number');
      return { vaccineCode: code, dose, givenOn: date(r.givenOn, 'givenOn', today, dob), batch: text(r.batch, 60) };
    }
    case 'growth': {
      const weightKg = range(r.weightKg, 'weightKg', 0.3, 250, true);
      const heightCm = range(r.heightCm, 'heightCm', 20, 250, true);
      const muacCm = range(r.muacCm, 'muacCm', 5, 50, true);
      if (weightKg === null && heightCm === null && muacCm === null) throw new RecordError('Give a weight, height or MUAC');
      return { measuredOn: date(r.measuredOn, 'measuredOn', today, dob), weightKg, heightCm, muacCm };
    }
    case 'screening': {
      const k = r.kind as ScreeningKind;
      if (!SCREENING_KINDS.includes(k)) throw new RecordError(`Unknown screening kind: ${String(r.kind)}`);
      const v = (r.value && typeof r.value === 'object' ? r.value : {}) as Record<string, unknown>;
      let value: Record<string, unknown>;
      if (k === 'bp') {
        const systolic = range(v.systolic, 'systolic', 50, 300)!;
        const diastolic = range(v.diastolic, 'diastolic', 30, 200)!;
        if (diastolic >= systolic) throw new RecordError('diastolic must be lower than systolic');
        value = { systolic, diastolic };
      } else if (k === 'sugar') value = { mgdl: range(v.mgdl, 'mgdl', 20, 800), fasting: v.fasting === true };
      else if (k === 'hb') value = { gdl: range(v.gdl, 'gdl', 2, 25) };
      else if (k === 'oral' || k === 'breast' || k === 'cervical') {
        if (!['normal', 'abnormal', 'referred'].includes(String(v.result))) throw new RecordError('result must be normal, abnormal or referred');
        value = { result: v.result };
      } else value = { note: text(v.note, 200) };
      return { kind: k, screenedOn: date(r.screenedOn, 'screenedOn', today, dob), value };
    }
    case 'pregnancy': {
      const lmp = date(r.lmp, 'lmp', today, dob);
      const ageDays = (Date.parse(today) - Date.parse(lmp)) / 86_400_000;
      if (ageDays > 45 * 7) throw new RecordError('lmp is more than 45 weeks ago');
      const deliveredOn = r.deliveredOn ? date(r.deliveredOn, 'deliveredOn', today, lmp) : null;
      const gravida = range(r.gravida, 'gravida', 1, 20, true);
      return { lmp, deliveredOn, gravida };
    }
  }
}
