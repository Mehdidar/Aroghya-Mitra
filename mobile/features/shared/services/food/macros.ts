// P2-compatible portion maths (per100g x grams / 100, same rounding as
// features/patient-ai/nutrition/macros.ts on p2/patient-ai-voice). Switch to P2's macros.ts once merged.
import type { MacrosPer100g } from './types';

export type Macros = MacrosPer100g;

export const PORTION_GRAMS = { min: 50, max: 500, step: 5 } as const;

/** Rough adult daily reference values, only to size the bars (not a personal target). */
export const DAILY_REFERENCE: Macros = { kcal: 2000, proteinG: 50, carbsG: 275, fatG: 70 };

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function macrosForPortion(per100g: Macros, grams: number): Macros {
  const f = safe(grams) / 100;
  return {
    kcal: Math.round(safe(per100g.kcal) * f),
    proteinG: round1(safe(per100g.proteinG) * f),
    carbsG: round1(safe(per100g.carbsG) * f),
    fatG: round1(safe(per100g.fatG) * f),
  };
}

/** Clamp to the slider range and snap to its step. */
export function clampPortion(grams: number): number {
  const { min, max, step } = PORTION_GRAMS;
  if (!Number.isFinite(grams)) return 200;
  return Math.min(max, Math.max(min, Math.round(grams / step) * step));
}

export const hasMacros = (m: Macros) => m.kcal + m.proteinG + m.carbsG + m.fatG > 0;
