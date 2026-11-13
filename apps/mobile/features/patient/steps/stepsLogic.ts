/** Pure helpers for the step counter (tested without a phone). */
export const DEFAULT_STEP_GOAL = 6000;
/** Average adult stride; enough for a rough "about 3.2 km". */
export const STRIDE_M = 0.72;

/** Local calendar day key, e.g. 2026-11-14 (the phone's own time zone, not UTC). */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The last `n` days, oldest first, ending today. */
export function lastDays(now: Date, n = 7): Date[] {
  const today = startOfDay(now);
  return Array.from({ length: n }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i)));
}

export const distanceKm = (steps: number) => Math.round(((steps * STRIDE_M) / 1000) * 10) / 10;

export const goalProgress = (steps: number, goal: number) => (goal > 0 ? Math.min(1, Math.max(0, steps / goal)) : 0);

/** Adds a live delta (Android counts from when we started listening) to the stored day total. */
export function addSteps(days: Record<string, number>, key: string, delta: number, keepDays = 14): Record<string, number> {
  if (!Number.isFinite(delta) || delta <= 0) return days;
  const next = { ...days, [key]: (days[key] ?? 0) + Math.round(delta) };
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keepDays))) delete next[k];
  return next;
}
