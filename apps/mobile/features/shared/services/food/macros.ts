// P2-compatible portion maths (per100g x grams / 100, same rounding as
// features/patient-ai/nutrition/macros.ts on p2/patient-ai-voice). Switch to P2's macros.ts once merged.
import type { MacrosPer100g } from './types';

export type Macros = Pick<MacrosPer100g, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>;

export const PORTION_GRAMS = { min: 50, max: 500, step: 5 } as const;

/** Rough adult daily reference values, only to size the bars (not a personal target). */
export const DAILY_REFERENCE: Macros = { kcal: 2000, proteinG: 50, carbsG: 275, fatG: 70 };

/** Daily references for the extras: ICMR fibre, WHO free sugar (10% of 2000 kcal) and WHO sodium. */
export const DAILY_REFERENCE_EXTRA = { fiberG: 30, sugarsG: 50, sodiumMg: 2000 } as const;

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

export type Extras = { fiberG?: number; sugarsG?: number; sodiumMg?: number };

/** Fibre, sugar and sodium for the portion; a key is absent when the server did not send it. */
export function extrasForPortion(per100g: MacrosPer100g, grams: number): Extras {
  const f = safe(grams) / 100;
  const out: Extras = {};
  if (per100g.fiberG !== undefined) out.fiberG = round1(safe(per100g.fiberG) * f);
  if (per100g.sugarsG !== undefined) out.sugarsG = round1(safe(per100g.sugarsG) * f);
  if (per100g.sodiumMg !== undefined) out.sodiumMg = Math.round(safe(per100g.sodiumMg) * f);
  return out;
}

/** Clamp to the slider range and snap to its step. */
export function clampPortion(grams: number): number {
  const { min, max, step } = PORTION_GRAMS;
  if (!Number.isFinite(grams)) return 200;
  return Math.min(max, Math.max(min, Math.round(grams / step) * step));
}

export const hasMacros = (m: Macros) => m.kcal + m.proteinG + m.carbsG + m.fatG > 0;
