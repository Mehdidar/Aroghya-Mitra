/**
 * Food analysis output. Macros are stored per 100 g plus an estimated portion,
 * so the app's portion slider can recalculate without another model call.
 */
import { z } from 'zod';
import { Confidence } from '../prescription/schema.ts';

const NonNegative = z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().nonnegative().finite());

export const MacrosPer100g = z.object({
  kcal: NonNegative,
  proteinG: NonNegative,
  carbsG: NonNegative,
  fatG: NonNegative,
});
export type MacrosPer100g = z.infer<typeof MacrosPer100g>;

export const FoodItem = z.object({
  name: z.string().trim().min(1), // "Dal tadka"
  localName: z.string().trim().min(1).nullable().catch(null), // "दाल तड़का"
  isIndianDish: z.boolean().catch(false),
  /** Household measure shown to the user: "1 katori", "2 rotis". */
  portionDescription: z.string().nullable().catch(null),
  estimatedGrams: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().positive().max(3000)),
  per100g: MacrosPer100g,
  confidence: Confidence.catch(0),
});
export type FoodItem = z.infer<typeof FoodItem>;

export const FoodAnalysis = z.object({
  isFood: z.boolean(),
  items: z.array(FoodItem).default([]),
  notes: z.string().nullable().catch(null).default(null),
});
export type FoodAnalysis = z.infer<typeof FoodAnalysis>;
