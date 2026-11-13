// mirrors server/ai/food on p2/patient-ai-voice (FoodRecognizer.ts + schema.ts); replace with an import once merged.
// Kept as Zod schemas so the app validates whatever the server returns before showing it.
import { z } from 'zod';

const num = z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().nonnegative().finite());

export const MacrosPer100gSchema = z.object({
  kcal: num,
  proteinG: num,
  carbsG: num,
  fatG: num,
});
export type MacrosPer100g = z.infer<typeof MacrosPer100gSchema>;

export const FoodItemSchema = z.object({
  name: z.string().trim().min(1),
  localName: z.string().trim().min(1).nullable().catch(null),
  isIndianDish: z.boolean().catch(false),
  portionDescription: z.string().nullable().catch(null),
  estimatedGrams: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().positive().max(3000)),
  per100g: MacrosPer100gSchema,
  confidence: z.number().min(0).max(1).catch(0),
});
export type FoodItem = z.infer<typeof FoodItemSchema>;

export const FoodRecognitionSchema = z.object({
  isFood: z.boolean(),
  items: z.array(FoodItemSchema).default([]),
  notes: z.string().nullable().catch(null).default(null),
  source: z.enum(['vision-llm', 'dishdetect']),
  /** False when the recognizer itself says the result should not be trusted. */
  reliable: z.boolean(),
});
export type FoodRecognition = z.infer<typeof FoodRecognitionSchema>;

/** What the screen gets: P2's FoodRecognition plus whether it came from the on-device demo mock. */
export type FoodScanResult = {
  recognition: FoodRecognition;
  demo: boolean;
  /** Why the demo mock was used: no server configured, or the server could not be reached. */
  demoReason?: 'unset' | 'unreachable';
};
