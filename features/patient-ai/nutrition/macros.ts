/**
 * Macro maths for the nutrition analyzer. Pure functions, used by the portion
 * slider and the daily log. All results are estimates.
 */

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** Portion slider range, as a multiple of the estimated portion. */
export const PORTION_MULTIPLIER = { min: 0.25, max: 3, step: 0.25 } as const;

/** kcal per gram (Atwater factors). */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Macros for a portion of `grams` of a food with the given per-100 g values. */
export function macrosForPortion(per100g: Macros, grams: number): Macros {
  const f = safe(grams) / 100;
  return {
    kcal: Math.round(safe(per100g.kcal) * f),
    proteinG: round1(safe(per100g.proteinG) * f),
    carbsG: round1(safe(per100g.carbsG) * f),
    fatG: round1(safe(per100g.fatG) * f),
  };
}

/** Clamp and snap a slider value to the allowed steps. */
export function snapMultiplier(m: number): number {
  const { min, max, step } = PORTION_MULTIPLIER;
  if (!Number.isFinite(m)) return 1;
  const snapped = Math.round(m / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

/** Grams for a slider position, relative to the estimated portion. */
export function gramsForMultiplier(estimatedGrams: number, multiplier: number): number {
  return Math.round(safe(estimatedGrams) * snapMultiplier(multiplier));
}

export function sumMacros(list: Macros[]): Macros {
  const total = list.reduce(
    (acc, m) => ({
      kcal: acc.kcal + safe(m.kcal),
      proteinG: acc.proteinG + safe(m.proteinG),
      carbsG: acc.carbsG + safe(m.carbsG),
      fatG: acc.fatG + safe(m.fatG),
    }),
    ZERO_MACROS,
  );
  return { kcal: Math.round(total.kcal), proteinG: round1(total.proteinG), carbsG: round1(total.carbsG), fatG: round1(total.fatG) };
}

/** Recalculate a whole meal after the user moves sliders: items with per-100 g values and chosen grams. */
export function mealTotals(items: { per100g: Macros; grams: number }[]): Macros {
  return sumMacros(items.map((i) => macrosForPortion(i.per100g, i.grams)));
}

/** Share of energy from each macro, in whole percent, for the rings. Sums to 100 when there is any energy. */
export function energySplit(m: Macros): { protein: number; carbs: number; fat: number } {
  const p = safe(m.proteinG) * KCAL_PER_G.protein;
  const c = safe(m.carbsG) * KCAL_PER_G.carbs;
  const f = safe(m.fatG) * KCAL_PER_G.fat;
  const total = p + c + f;
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 };
  // Largest-remainder rounding so the three values add up to exactly 100.
  const raw = [p, c, f].map((v) => (v / total) * 100);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return { protein: floored[0], carbs: floored[1], fat: floored[2] };
}

/** Progress toward a daily target, 0–1 (capped), for ring fill. */
export function progress(value: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.min(1, safe(value) / target);
}
