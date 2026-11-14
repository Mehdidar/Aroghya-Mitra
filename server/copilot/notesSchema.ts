/**
 * Structured consultation note from a doctor's dictation (copilot, feature D).
 * The model's JSON is validated here; the doctor edits and approves every field
 * on the phone before anything is saved.
 *
 * Lenient on input (numbers as strings, "120/80", lists as comma text, empty
 * strings) and strict on output: implausible vitals become null rather than a
 * wrong number, and a medicine needs a name.
 */
import { z } from 'zod';

const Text = z.preprocess((v) => {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) v = v.filter((x) => typeof x === 'string').join('; ');
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' || /^(n\/?a|none|null|not (mentioned|stated|given))$/i.test(t) ? null : t.slice(0, 2000);
}, z.string().nullable());

const List = z.preprocess((v) => {
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') return v.split(/[,;\n]+/);
  return Array.isArray(v) ? v : [];
}, z.array(z.unknown()).transform((a) => [...new Set(a.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))].slice(0, 20)));

/** A number within [min, max], else null (never a guessed value). */
const Vital = (min: number, max: number) =>
  z.preprocess((v) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v.replace(/[^\d.]/g, '')) : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  }, z.number().nullable());

export const NoteVitals = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object') return {};
    const o = { ...(v as Record<string, unknown>) };
    // "bp": "150/100" → systolic / diastolic
    const bp = o.bp ?? o.bloodPressure;
    if (typeof bp === 'string' && /\d+\s*\/\s*\d+/.test(bp) && o.systolic == null && o.diastolic == null) {
      const [s, d] = bp.split('/');
      o.systolic = s;
      o.diastolic = d;
    }
    return o;
  },
  z.object({
    systolic: Vital(50, 300).default(null),
    diastolic: Vital(20, 200).default(null),
    heartRate: Vital(20, 250).default(null),
    temperatureC: z
      .preprocess((v) => {
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : NaN;
        if (!Number.isFinite(n)) return null;
        const c = n > 50 ? ((n - 32) * 5) / 9 : n; // dictated in °F
        return c >= 30 && c <= 45 ? Math.round(c * 10) / 10 : null;
      }, z.number().nullable())
      .default(null),
    spo2: Vital(50, 100).default(null),
    respiratoryRate: Vital(5, 80).default(null),
    weightKg: Vital(0.5, 300).default(null),
    bloodSugarMgDl: Vital(10, 1000).default(null),
  }),
);

export const NoteMedicine = z.object({
  name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(1).max(120)),
  dose: Text.default(null),
  frequency: Text.default(null),
  duration: Text.default(null),
  instructions: Text.default(null),
});

export const ConsultationNoteDraft = z.object({
  chiefComplaint: Text.default(null),
  history: Text.default(null),
  examination: Text.default(null),
  vitals: NoteVitals.default({ systolic: null, diastolic: null, heartRate: null, temperatureC: null, spo2: null, respiratoryRate: null, weightKg: null, bloodSugarMgDl: null }),
  assessment: Text.default(null),
  plan: Text.default(null),
  labOrders: List.default([]),
  followUp: Text.default(null),
  medicines: z
    .preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown()))
    .transform((a) => a.map((m) => NoteMedicine.safeParse(m)).filter((r) => r.success).map((r) => r.data!).slice(0, 15)),
});

export type ConsultationNoteDraft = z.infer<typeof ConsultationNoteDraft>;
export type NoteVitals = z.infer<typeof NoteVitals>;

export const NOTES_SCHEMA_HINT = `{
  "chiefComplaint": string | null,
  "history": string | null,
  "examination": string | null,
  "vitals": { "systolic": number|null, "diastolic": number|null, "heartRate": number|null, "temperatureC": number|null, "spo2": number|null, "respiratoryRate": number|null, "weightKg": number|null, "bloodSugarMgDl": number|null },
  "assessment": string | null,
  "plan": string | null,
  "labOrders": string[],
  "followUp": string | null,
  "medicines": [ { "name": string, "dose": string|null, "frequency": string|null, "duration": string|null, "instructions": string|null } ]
}`;

export const NOTES_SYSTEM_PROMPT = `You turn a doctor's dictated consultation note into structured JSON for a primary health centre in India.
Rules:
- Use ONLY what the doctor said. Never add a symptom, finding, diagnosis, test, medicine, dose or number that was not dictated. If something was not said, use null (or [] for lists).
- The dictation may be in English, Hindi, Kannada, Tamil, Telugu, Urdu or Kashmiri, or mixed. Write every field in clear English. Keep medicine names in English as the doctor said them (generic or brand); do not substitute or correct them.
- Put each medicine the doctor said to give in "medicines", with dose, frequency (e.g. "twice a day", "at night"), duration (e.g. "5 days") and instructions (e.g. "after food") only if said.
- Vitals are numbers only, as dictated (BP 150 by 100 means systolic 150, diastolic 100).
- "followUp" is the follow-up as said (e.g. "after 1 week", "on 21 November").
- Reply with one JSON object only, no prose, no markdown.`;
