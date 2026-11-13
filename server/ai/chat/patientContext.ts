/**
 * The signed-in patient's record, cut down to what the chat assistant needs to
 * tailor an answer, with personal identifiers left out.
 *
 *   - never included: name, phone, address/area, ids, blood bank or facility
 *     names, doctor or ASHA names
 *   - included: age, sex, pregnancy weeks, conditions, allergies, current and
 *     past medicines, the last 3 vitals, the last 3 reports (title + date), the
 *     last consultation, open risk alerts, the latest ASHA visit note, and the
 *     food preferences the phone sends
 *
 * Access: `loadPatientContext` only returns a record the caller may open
 * (server/records/access.ts) AND that is their own (basis 'self'): the
 * assistant speaks to the patient in the second person, so a doctor or admin
 * opening someone else's record here would be wrong even when allowed elsewhere.
 * Nothing from the record is ever logged.
 */
import type { PatientRecordBundle, RecordsRepository } from '../../records/repository.ts';
import type { Patient, Profile } from '../../../packages/shared/types.ts';
import { resolveAccess } from '../../records/access.ts';

export type DietType = 'veg' | 'nonveg' | 'vegan' | 'jain';
export const DIET_TYPES: DietType[] = ['veg', 'nonveg', 'vegan', 'jain'];

export interface DietPreferences {
  type?: DietType;
  noOnionGarlic?: boolean;
  /** Foods the patient avoids, as they typed them (cleaned, at most 10 short items). */
  avoid?: string[];
}

/** Which part of the record informed an answer. The app shows these as translated labels. */
export type ContextLabel = 'pregnancy' | 'conditions' | 'allergies' | 'medicines' | 'past_medicines' | 'vitals' | 'reports' | 'consultation' | 'alerts' | 'asha_visit' | 'diet' | 'age';

export interface ContextMedicine {
  name: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
  /** Prescription date (YYYY-MM-DD). */
  since: string;
}

export interface PatientContext {
  ageYears: number | null;
  sex: Patient['sex'];
  /** Gestation in whole weeks, or null when not pregnant / unknown. */
  pregnancy: { weeks: number; basis: 'lmp' | 'record_note' } | null;
  conditions: string[];
  allergies: string[];
  activeMedicines: ContextMedicine[];
  /** Medicines from earlier prescriptions that have ended (names only, newest first). */
  pastMedicines: string[];
  vitals: { date: string; bp?: string; weightKg?: number; heartRate?: number; spo2?: number; temperatureC?: number; bloodSugarMgDl?: number }[];
  reports: { title: string; date: string; category: string }[];
  lastConsultation: { date: string; diagnosis: string | null; notes: string | null; followUpDate: string | null } | null;
  openAlerts: { level: string; reason: string; date: string }[];
  lastAshaVisit: { date: string; notes: string | null } | null;
  diet: DietPreferences | null;
}

export type PatientContextStatus = 'ok' | 'not_permitted' | 'no_patient' | 'unavailable';

export interface PatientContextResult {
  status: PatientContextStatus;
  context: PatientContext | null;
}

const DAY = 86_400_000;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const clip = (s: string | null | undefined, n: number) => {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const PREGNANCY_WORDS = /pregnan|gestation|antenatal|\banc\b|trimester|eclampsia|fetal|foetal|usg/i;
const WEEKS = /\b(\d{1,2})\s*(?:weeks?|wks?)\b/i;

/**
 * Gestation weeks from the record.
 *  1. `pregnancy.lmp` when the repository carries the ASHA pregnancy field (patients.pregnancy jsonb).
 *  2. Otherwise the newest dated note that mentions both pregnancy and "N weeks"
 *     ("Gestational hypertension, 28 weeks", "BP 150/100 at 34 weeks ... pre-eclampsia"),
 *     plus the weeks since that note.
 * Over 42 weeks means the pregnancy has ended: not pregnant.
 */
export function pregnancyWeeks(bundle: PatientRecordBundle, now: Date): PatientContext['pregnancy'] {
  if (bundle.patient.sex === 'male') return null;
  const preg = (bundle.patient as Patient & { pregnancy?: { lmp?: string } | null }).pregnancy;
  if (preg?.lmp) {
    const w = Math.floor((now.getTime() - Date.parse(preg.lmp)) / (7 * DAY));
    return w >= 0 && w <= 42 ? { weeks: w, basis: 'lmp' } : null;
  }
  const notes: { at: string; text: string }[] = [
    ...bundle.referrals.map((r) => ({ at: r.createdAt, text: r.reason })),
    ...bundle.riskAlerts.map((a) => ({ at: a.createdAt, text: `${a.id} ${a.reason}` })),
    ...bundle.ashaVisits.map((v) => ({ at: v.visitedAt, text: v.notes ?? '' })),
    ...bundle.consultations.map((c) => ({ at: c.startedAt, text: `${c.diagnosis ?? ''} ${c.notes ?? ''}` })),
    ...bundle.prescriptions.map((p) => ({ at: p.issuedAt, text: `${p.diagnosis ?? ''} ${p.notes ?? ''}` })),
    ...bundle.reports.map((r) => ({ at: r.reportDate ?? r.createdAt, text: `${r.category === 'imaging' ? 'usg ' : ''}${r.title}` })),
  ];
  const dated = notes
    .filter((n) => n.at && WEEKS.test(n.text) && PREGNANCY_WORDS.test(n.text))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const latest = dated[0];
  if (!latest) return null;
  const atNote = Number(WEEKS.exec(latest.text)![1]);
  const weeks = atNote + Math.floor(Math.max(0, now.getTime() - Date.parse(latest.at)) / (7 * DAY));
  return atNote >= 4 && weeks <= 42 ? { weeks, basis: 'record_note' } : null;
}

const ageOf = (dob: string | null, now: Date): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
};

/** Pure: the compact context from a record bundle. */
export function buildPatientContext(bundle: PatientRecordBundle, now: Date, diet: DietPreferences | null = null): PatientContext {
  const t = now.getTime();
  const prescriptions = [...bundle.prescriptions].sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
  const activeMedicines: ContextMedicine[] = [];
  const pastMedicines: string[] = [];
  for (const p of prescriptions) {
    const issued = Date.parse(p.issuedAt);
    for (const item of p.items) {
      // No duration: treat as ongoing for 90 days from the prescription, then as past.
      const end = issued + (item.durationDays ?? 90) * DAY;
      if (end >= t) {
        if (!activeMedicines.some((m) => m.name.toLowerCase() === item.name.toLowerCase())) {
          activeMedicines.push({ name: item.name, dosage: item.dosage || undefined, frequency: item.frequency || undefined, instructions: item.instructions ?? undefined, since: day(p.issuedAt) });
        }
      } else if (!pastMedicines.includes(item.name) && !activeMedicines.some((m) => m.name === item.name)) {
        pastMedicines.push(item.name);
      }
    }
  }
  const vitals = [...bundle.vitals]
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
    .slice(0, 3)
    .map((v) => ({
      date: day(v.recordedAt),
      ...(v.systolic && v.diastolic ? { bp: `${v.systolic}/${v.diastolic}` } : {}),
      ...(v.weightKg ? { weightKg: v.weightKg } : {}),
      ...(v.heartRate ? { heartRate: v.heartRate } : {}),
      ...(v.spo2 ? { spo2: v.spo2 } : {}),
      ...(v.temperatureC ? { temperatureC: v.temperatureC } : {}),
      ...(v.bloodSugarMgDl ? { bloodSugarMgDl: v.bloodSugarMgDl } : {}),
    }));
  const reports = [...bundle.reports]
    .sort((a, b) => Date.parse(b.reportDate ?? b.createdAt) - Date.parse(a.reportDate ?? a.createdAt))
    .slice(0, 3)
    .map((r) => ({ title: clip(r.title, 80)!, date: day(r.reportDate ?? r.createdAt), category: r.category }));
  const c = [...bundle.consultations].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  const v = [...bundle.ashaVisits].sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt))[0];
  return {
    ageYears: ageOf(bundle.patient.dateOfBirth, now),
    sex: bundle.patient.sex,
    pregnancy: pregnancyWeeks(bundle, now),
    conditions: bundle.patient.chronicConditions.slice(0, 8),
    allergies: bundle.patient.allergies.slice(0, 8),
    activeMedicines: activeMedicines.slice(0, 8),
    pastMedicines: pastMedicines.slice(0, 5),
    vitals,
    reports,
    lastConsultation: c ? { date: day(c.startedAt), diagnosis: clip(c.diagnosis, 120), notes: clip(c.notes, 240), followUpDate: c.followUpDate } : null,
    openAlerts: bundle.riskAlerts
      .filter((a) => !a.resolvedAt)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 3)
      .map((a) => ({ level: a.level, reason: clip(a.reason, 160)!, date: day(a.createdAt) })),
    lastAshaVisit: v ? { date: day(v.visitedAt), notes: clip(v.notes, 160) } : null,
    diet,
  };
}

/** The food preferences in a chat request: only known diet types, short plain-text avoid items. */
export function parseDietPreferences(value: unknown): DietPreferences | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const type = DIET_TYPES.includes(v.type as DietType) ? (v.type as DietType) : undefined;
  const noOnionGarlic = v.noOnionGarlic === true ? true : undefined;
  const avoid = Array.isArray(v.avoid)
    ? [...new Set(
        v.avoid
          .filter((x): x is string => typeof x === 'string')
          // Letters, numbers, spaces and a little punctuation only: this text goes into the prompt.
          .map((x) => x.normalize('NFC').replace(/[^\p{L}\p{M}\p{N} '\-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40))
          .filter(Boolean),
      )].slice(0, 10)
    : [];
  if (!type && !noOnionGarlic && avoid.length === 0) return null;
  return { ...(type ? { type } : {}), ...(noOnionGarlic ? { noOnionGarlic } : {}), ...(avoid.length ? { avoid } : {}) };
}

/** A context with only the food preferences (no record, or no access to one). */
export function dietOnlyContext(diet: DietPreferences | null): PatientContext | null {
  if (!diet) return null;
  return { ageYears: null, sex: null, pregnancy: null, conditions: [], allergies: [], activeMedicines: [], pastMedicines: [], vitals: [], reports: [], lastConsultation: null, openAlerts: [], lastAshaVisit: null, diet };
}

/**
 * Loads the context for `patientId` if `viewer` owns that record. Errors and
 * slow stores fall back to 'unavailable' so the chat still answers.
 */
export async function loadPatientContext(
  repo: RecordsRepository,
  viewer: Profile,
  patientId: string,
  opts: { now?: Date; diet?: DietPreferences | null; timeoutMs?: number; onDenied?: (reason: string) => Promise<void> } = {},
): Promise<PatientContextResult> {
  const now = opts.now ?? new Date();
  const diet = opts.diet ?? null;
  const work = async (): Promise<PatientContextResult> => {
    const d = await resolveAccess(repo, viewer, patientId, now);
    if (!d.allowed || d.basis !== 'self') {
      const reason = d.allowed ? 'not_permitted' : d.reason;
      if (reason !== 'no_patient') await opts.onDenied?.(reason).catch(() => undefined);
      return { status: reason === 'no_patient' ? 'no_patient' : 'not_permitted', context: dietOnlyContext(diet) };
    }
    const bundle = await repo.loadRecordBundle(patientId);
    if (!bundle) return { status: 'no_patient', context: dietOnlyContext(diet) };
    return { status: 'ok', context: buildPatientContext(bundle, now, diet) };
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<PatientContextResult>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'unavailable', context: dietOnlyContext(diet) }), opts.timeoutMs ?? 5000);
      }),
    ]);
  } catch {
    return { status: 'unavailable', context: dietOnlyContext(diet) };
  } finally {
    clearTimeout(timer);
  }
}

/** True when the context says high blood pressure (condition, diagnosis, or the latest reading ≥ 140/90). */
export function hasHypertension(ctx: PatientContext): boolean {
  const re = /hypertension|high (?:bp|blood pressure)|\bhtn\b|eclampsia/i;
  if (ctx.conditions.some((c) => re.test(c))) return true;
  if (ctx.lastConsultation?.diagnosis && re.test(ctx.lastConsultation.diagnosis)) return true;
  const bp = ctx.vitals[0]?.bp;
  if (bp) {
    const [s, d] = bp.split('/').map(Number);
    if (s >= 140 || d >= 90) return true;
  }
  return false;
}

/** The labels of the parts of the context that exist, for the "based on" chip. */
export function presentLabels(ctx: PatientContext | null): ContextLabel[] {
  if (!ctx) return [];
  const out: ContextLabel[] = [];
  if (ctx.pregnancy) out.push('pregnancy');
  if (ctx.conditions.length) out.push('conditions');
  if (ctx.allergies.length) out.push('allergies');
  if (ctx.activeMedicines.length) out.push('medicines');
  if (ctx.pastMedicines.length) out.push('past_medicines');
  if (ctx.vitals.length) out.push('vitals');
  if (ctx.reports.length) out.push('reports');
  if (ctx.lastConsultation) out.push('consultation');
  if (ctx.openAlerts.length) out.push('alerts');
  if (ctx.lastAshaVisit) out.push('asha_visit');
  if (ctx.diet) out.push('diet');
  if (ctx.ageYears !== null) out.push('age');
  return out;
}

const TOPICS: { re: RegExp; labels: ContextLabel[] }[] = [
  // Food and diet
  { re: /\b(eat|eating|food|diet|drink|meal|breakfast|lunch|dinner|snack|fruit|vegetable|salt|sugar|pickle|achar|papad|namkeen|tea|coffee|milk|egg|meat|fish|chicken|rice|roti|khana|khaana)\w*|खा|खाना|अचार|भोजन/iu, labels: ['diet', 'conditions', 'pregnancy', 'allergies', 'vitals'] },
  // Medicines
  { re: /\b(medicine|tablet|pill|dose|drug|syrup|injection|painkiller|antibiotic|take|dawa|dawai|goli)\w*|\w+(?:fen|pril|sartan|cillin|mycin|olol|pine|zole)\b|दवा|गोली/iu, labels: ['allergies', 'medicines', 'pregnancy', 'conditions'] },
  // Symptoms
  { re: /\b(pain|ache|headache|fever|vomit|swelling|swollen|blur|dizzy|bleed|tired|weak|cough|breath|vision|movement|kick|sick|feel)\w*|dard|दर्द|बुखार|सूजन/iu, labels: ['pregnancy', 'conditions', 'vitals', 'alerts', 'medicines', 'asha_visit'] },
  // Readings and reports
  { re: /\b(bp|blood pressure|pressure|sugar|weight|report|test|result|scan|ultrasound|haemoglobin|hemoglobin|reading)\w*/iu, labels: ['vitals', 'reports', 'conditions', 'consultation'] },
  // Doctor visits and follow-up
  { re: /\b(doctor|visit|appointment|follow|check-?up|consult|asha|delivery|due date)\w*/iu, labels: ['consultation', 'pregnancy', 'alerts'] },
];

/**
 * Which parts of the record are relevant to this message (a deterministic
 * guess, shown to the patient as "based on: ..."). Parts that triggered a
 * safety warning are always included. Falls back to the core safety parts.
 */
export function relevantLabels(message: string, ctx: PatientContext | null, fromWarnings: ContextLabel[] = []): ContextLabel[] {
  const present = new Set(presentLabels(ctx));
  if (present.size === 0) return [];
  const wanted = new Set<ContextLabel>(fromWarnings);
  for (const topic of TOPICS) if (topic.re.test(message)) topic.labels.forEach((l) => wanted.add(l));
  if (wanted.size === 0) ['pregnancy', 'conditions', 'medicines', 'allergies'].forEach((l) => wanted.add(l as ContextLabel));
  const order = presentLabels(ctx);
  return order.filter((l) => present.has(l) && wanted.has(l) && l !== 'age');
}
