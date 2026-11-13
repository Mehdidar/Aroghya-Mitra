/**
 * Zod schemas for prescription extraction. Every medicine field carries a
 * confidence score, so the UI can mark it "Confirm with pharmacist".
 *
 * The schemas are lenient on input (string numbers, "85" or "85%" confidence,
 * "Tablet", "after food") and strict on output.
 */
import { z } from 'zod';
import { DOSE_SLOTS, parseDurationDays } from './frequency.ts';

/** Below this confidence a field is shown as "Confirm with pharmacist". */
export const CONFIRM_THRESHOLD = 0.75;

export function normalizeConfidence(v: unknown): unknown {
  let n: unknown = v;
  if (typeof v === 'string') n = Number(v.replace('%', '').trim());
  if (typeof n === 'number' && Number.isFinite(n) && n > 1 && n <= 100) return n / 100;
  return n;
}

export const Confidence = z.preprocess(normalizeConfidence, z.number().min(0).max(1));

export type Field<T> = { value: T | null; confidence: number };

/** A value plus confidence. A missing field becomes { value: null, confidence: 0 }; null always means confidence 0. */
export function field<T extends z.ZodType>(inner: T): z.ZodType<Field<z.output<T>>> {
  const shape = z.object({ value: inner.nullable().catch(null), confidence: Confidence.catch(0) });
  return z
    .preprocess((v) => (v === undefined || v === null ? { value: null, confidence: 0 } : v), shape)
    .transform((f): Field<z.output<T>> => {
      const { value, confidence } = f as { value?: z.output<T> | null; confidence: number };
      return value === null || value === undefined ? { value: null, confidence: 0 } : { value, confidence };
    }) as unknown as z.ZodType<Field<z.output<T>>>;
}

/** Lower-case, spaces and hyphens to underscores. Unknown values become `fallback`. */
function lenientEnum<const T extends readonly [string, ...string[]]>(values: T, fallback: T[number] | null, aliases: Record<string, T[number]> = {}) {
  return z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const key = v.toLowerCase().trim().replace(/[\s-]+/g, '_');
    if ((values as readonly string[]).includes(key)) return key;
    if (aliases[key]) return aliases[key];
    return fallback;
  }, z.enum(values));
}

export const MEDICINE_FORMS = ['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'drops', 'ointment', 'cream', 'gel', 'inhaler', 'powder', 'sachet', 'other'] as const;
export const MEAL_RELATIONS = ['before_food', 'after_food', 'with_food', 'empty_stomach', 'any'] as const;

export const MedicineForm = lenientEnum(MEDICINE_FORMS, 'other', {
  tab: 'tablet', tabs: 'tablet', tablets: 'tablet', cap: 'capsule', caps: 'capsule', capsules: 'capsule',
  syp: 'syrup', syr: 'syrup', susp: 'suspension', inj: 'injection', oint: 'ointment', gtt: 'drops',
});
export const MealRelation = lenientEnum(MEAL_RELATIONS, 'any', {
  ac: 'before_food', before_meal: 'before_food', before_meals: 'before_food',
  pc: 'after_food', after_meal: 'after_food', after_meals: 'after_food',
  with_meal: 'with_food', with_meals: 'with_food', empty: 'empty_stomach',
});
export const DoseSlotSchema = lenientEnum(['morning', 'afternoon', 'evening', 'night'] as const, null, {
  am: 'morning', breakfast: 'morning', noon: 'afternoon', lunch: 'afternoon', pm: 'evening', bedtime: 'night', dinner: 'night', hs: 'night',
});

const DurationDays = z.preprocess(
  (v) => (typeof v === 'string' || typeof v === 'number' ? parseDurationDays(v) : v),
  z.number().int().positive(),
);

const Bool = z.preprocess((v) => (v === 'true' || v === 'yes' ? true : v === 'false' || v === 'no' ? false : v), z.boolean());

const Slots = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : v),
  z
    .array(DoseSlotSchema.nullable().catch(null))
    .transform((a) => DOSE_SLOTS.filter((s) => a.includes(s))) // dedupe, keep day order
    .pipe(z.array(z.enum(DOSE_SLOTS)).min(1)),
);

const NonEmptyString = z.string().trim().min(1);

export const ExtractedMedicine = z.object({
  /** As written on the prescription (brand name). */
  name: field(NonEmptyString),
  genericName: field(NonEmptyString),
  strength: field(NonEmptyString), // "500 mg", "5 mg/5 ml"
  form: field(MedicineForm),
  dose: field(NonEmptyString), // "1 tablet", "5 ml", "2 puffs"
  /** Exactly as written: "1-0-1", "BD", "SOS". */
  frequencyRaw: field(NonEmptyString),
  timings: field(Slots),
  mealRelation: field(MealRelation),
  durationDays: field(DurationDays),
  asNeeded: field(Bool),
  instructions: field(NonEmptyString),
});
export type ExtractedMedicine = z.infer<typeof ExtractedMedicine>;

export const ExtractedPrescription = z.object({
  isPrescription: Bool,
  legibility: lenientEnum(['good', 'partial', 'poor'] as const, 'partial'),
  doctorName: field(NonEmptyString),
  clinicName: field(NonEmptyString),
  date: field(NonEmptyString),
  patientName: field(NonEmptyString),
  medicines: z.array(ExtractedMedicine).default([]),
  notes: z.string().nullable().catch(null).default(null),
});
export type ExtractedPrescription = z.infer<typeof ExtractedPrescription>;

/** Fields the patient must have right before reminders can be set. */
export const ESSENTIAL_FIELDS = ['name', 'strength', 'dose', 'timings', 'durationDays'] as const satisfies readonly (keyof ExtractedMedicine)[];

export function needsConfirmation(f: Field<unknown>): boolean {
  return f.value === null || f.confidence < CONFIRM_THRESHOLD;
}

/** Essential fields to mark "Confirm with pharmacist". As-needed medicines do not need timings or a duration. */
export function fieldsToConfirm(med: ExtractedMedicine): (typeof ESSENTIAL_FIELDS)[number][] {
  const asNeeded = med.asNeeded.value === true;
  return ESSENTIAL_FIELDS.filter((k) => {
    if (asNeeded && (k === 'timings' || k === 'durationDays')) return false;
    return needsConfirmation(med[k] as Field<unknown>);
  });
}

/** Plain-language card text, produced in a second step in the patient's language. */
export const MedicineExplanation = z.object({
  index: z.number().int().nonnegative(),
  title: z.string(), // "Paracetamol 500 mg"
  commonlyUsedFor: z.string().nullable(), // hedged: "commonly used for fever and pain"
  howToTake: z.string(), // "1 tablet in the morning and at night, after food, for 5 days"
  cautions: z.array(z.string()).default([]),
});
export const MedicineExplanations = z.object({ medicines: z.array(MedicineExplanation) });
export type MedicineExplanation = z.infer<typeof MedicineExplanation>;
