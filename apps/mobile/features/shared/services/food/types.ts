// mirrors server/ai/food on p2/patient-ai-voice (FoodRecognizer.ts + schema.ts); replace with an import once merged.
// Kept as Zod schemas so the app validates whatever the server returns before showing it.
// DishDetect's own POST /ai/food (api/food.py) returns this shape with the optional extras below:
// fibre / sugar / sodium, a typical portion, dietary restrictions and the provenance of the numbers.
// Every extra is optional with a safe fallback, so P2's plainer responses still parse.
import { z } from 'zod';

const num = z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().nonnegative().finite());
const optNum = z
  .preprocess((v) => (v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v) : v), z.number().nonnegative().finite().optional())
  .catch(undefined);

export const MacrosPer100gSchema = z.object({
  kcal: num,
  proteinG: num,
  carbsG: num,
  fatG: num,
  fiberG: optNum,
  sugarsG: optNum,
  sodiumMg: optNum,
});
export type MacrosPer100g = z.infer<typeof MacrosPer100gSchema>;

export const DIET_TIERS = ['non_veg', 'vegetarian', 'vegan', 'meat_free'] as const;
export type DietTier = (typeof DIET_TIERS)[number];

export const ALLERGENS = ['dairy', 'egg', 'gluten', 'nuts', 'peanut', 'sesame', 'soy', 'fish', 'shellfish', 'poppy'] as const;
export type Allergen = (typeof ALLERGENS)[number];
const isAllergen = (s: unknown): s is Allergen => typeof s === 'string' && (ALLERGENS as readonly string[]).includes(s);

export const CAUTION_CODES = ['diabetes', 'hypertension', 'heart', 'energy_dense'] as const;
export const CAUTION_LEVELS = ['high', 'moderate'] as const;
export const DietCautionSchema = z.object({ code: z.enum(CAUTION_CODES), level: z.enum(CAUTION_LEVELS) });
export type DietCaution = z.infer<typeof DietCautionSchema>;

/** Dietary restrictions, derived server-side from the dish taxonomy and the curated nutrition table (core/diet.py). */
export const DietInfoSchema = z.object({
  tier: z.enum(DIET_TIERS).nullable().catch(null),
  /** False when the server's own dietary verdict did not clear its confidence floor. */
  reliable: z.boolean().catch(false),
  // Unknown allergen names are dropped one by one rather than failing the whole list.
  allergens: z
    .array(z.unknown())
    .catch([])
    .transform((a) => a.filter(isAllergen)),
  containsOnionGarlic: z.boolean().nullable().catch(null),
  suitable: z.record(z.string(), z.boolean().nullable()).catch({}),
  cautions: z
    .array(z.unknown())
    .catch([])
    .transform((a) =>
      a.flatMap((c) => {
        const p = DietCautionSchema.safeParse(c);
        return p.success ? [p.data] : [];
      })
    ),
});
export type DietInfo = z.infer<typeof DietInfoSchema>;

export const NutritionProvenanceSchema = z.object({
  provenance: z.enum(['verified', 'estimated', 'none']).catch('none'),
  source: z.string().nullable().catch(null),
  note: z.string().nullable().catch(null),
});
export type NutritionProvenance = z.infer<typeof NutritionProvenanceSchema>;

export const FoodItemSchema = z.object({
  name: z.string().trim().min(1),
  localName: z.string().trim().min(1).nullable().catch(null),
  isIndianDish: z.boolean().catch(false),
  portionDescription: z.string().nullable().catch(null),
  estimatedGrams: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().positive().max(3000)),
  per100g: MacrosPer100gSchema,
  confidence: z.number().min(0).max(1).catch(0),
  diet: DietInfoSchema.optional().catch(undefined),
  nutrition: NutritionProvenanceSchema.optional().catch(undefined),
});
export type FoodItem = z.infer<typeof FoodItemSchema>;

export const FoodRecognitionSchema = z.object({
  isFood: z.boolean(),
  items: z.array(FoodItemSchema).default([]),
  notes: z.string().nullable().catch(null).default(null),
  source: z.enum(['vision-llm', 'dishdetect']),
  /** False when the recognizer itself says the result should not be trusted. */
  reliable: z.boolean(),
  /** DishDetect's request id, so "wrong dish" feedback can point at this exact photo. */
  requestId: z.string().nullable().optional().catch(null),
});
export type FoodRecognition = z.infer<typeof FoodRecognitionSchema>;

/** What the screen gets: P2's FoodRecognition plus whether it came from the on-device demo mock. */
export type FoodScanResult = {
  recognition: FoodRecognition;
  demo: boolean;
  /** Why the demo mock was used: no server configured, or the server could not be reached. */
  demoReason?: 'unset' | 'unreachable';
};
