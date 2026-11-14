/** Calendar-day arithmetic on YYYY-MM-DD strings, in UTC so results never depend on the device time zone. */
import type { AgeSpec } from './guidelines/common.ts';

const DAY = 86_400_000;

/** A Date (local calendar day) or an ISO string to YYYY-MM-DD. */
export function toDay(d: string | Date): string {
  if (typeof d === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}/.test(d)) throw new Error(`Not a date: ${d}`);
    return d.slice(0, 10);
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const parts = (s: string) => s.split('-').map(Number) as [number, number, number];
export const dayNumber = (s: string): number => {
  const [y, m, d] = parts(s);
  return Date.UTC(y, m - 1, d) / DAY;
};
export const fromDayNumber = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);

export const addDays = (s: string, days: number): string => fromDayNumber(dayNumber(s) + days);
export const diffDays = (a: string, b: string): number => dayNumber(a) - dayNumber(b);

/** Add calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: string, months: number): string {
  const [y, m, d] = parts(s);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fromDayNumber(Date.UTC(ny, nm, Math.min(d, last)) / DAY);
}

export const addAge = (dob: string, a: AgeSpec): string => addDays(addMonths(dob, (a.y ?? 0) * 12 + (a.m ?? 0)), (a.w ?? 0) * 7 + (a.d ?? 0));

/** Whole years of age on `on`. */
export function ageYears(dob: string, on: string): number {
  const [y1, m1, d1] = parts(dob);
  const [y2, m2, d2] = parts(on);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

/** Age in (fractional) months, WHO convention: days / 30.4375. */
export const ageMonths = (dob: string, on: string): number => diffDays(on, dob) / 30.4375;

export const maxDay = (...days: (string | null | undefined)[]): string | null => days.filter((d): d is string => !!d).reduce<string | null>((a, b) => (a === null || b > a ? b : a), null);
export const minDay = (...days: (string | null | undefined)[]): string | null => days.filter((d): d is string => !!d).reduce<string | null>((a, b) => (a === null || b < a ? b : a), null);
