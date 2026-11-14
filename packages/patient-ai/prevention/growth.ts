/** WHO LMS z-scores and growth flags (pure). */
import { GROWTH_MONITORING, HEIGHT_FOR_AGE, WEIGHT_FOR_AGE, type LmsRow } from './guidelines/growth.ts';

/** L, M, S at `months`, linearly interpolated between the table rows; null outside the table. */
export function lmsAt(rows: LmsRow[], months: number): { L: number; M: number; S: number } | null {
  if (months < rows[0][0] || months > rows[rows.length - 1][0]) return null;
  for (let i = 0; i < rows.length - 1; i++) {
    const [a, b] = [rows[i], rows[i + 1]];
    if (months >= a[0] && months <= b[0]) {
      const f = b[0] === a[0] ? 0 : (months - a[0]) / (b[0] - a[0]);
      const lerp = (k: 1 | 2 | 3) => a[k] + (b[k] - a[k]) * f;
      return { L: lerp(1), M: lerp(2), S: lerp(3) };
    }
  }
  const last = rows[rows.length - 1];
  return { L: last[1], M: last[2], S: last[3] };
}

/** The WHO LMS z-score: ((x/M)^L - 1) / (L*S), or ln(x/M)/S when L = 0. (No WHO tail adjustment beyond +-3 SD.) */
export function lmsZ(x: number, lms: { L: number; M: number; S: number }): number {
  const { L, M, S } = lms;
  return Math.abs(L) < 1e-9 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
}

export type GrowthSex = 'female' | 'male';
const round1 = (n: number) => Math.round(n * 10) / 10;

export function weightForAgeZ(weightKg: number, ageMonths: number, sex: GrowthSex): number | null {
  const lms = lmsAt(sex === 'male' ? WEIGHT_FOR_AGE.boys : WEIGHT_FOR_AGE.girls, ageMonths);
  return lms ? round1(lmsZ(weightKg, lms)) : null;
}

export function heightForAgeZ(heightCm: number, ageMonths: number, sex: GrowthSex): number | null {
  const lms = lmsAt(sex === 'male' ? HEIGHT_FOR_AGE.boys : HEIGHT_FOR_AGE.girls, ageMonths);
  return lms ? round1(lmsZ(heightCm, lms)) : null;
}

/** Days between growth checks at this age, or null when routine monitoring has ended. */
export function growthIntervalDays(ageMonths: number): number | null {
  if (ageMonths < GROWTH_MONITORING.monthlyUntilMonths) return 30;
  if (ageMonths < GROWTH_MONITORING.quarterlyUntilMonths) return 91;
  return null;
}
