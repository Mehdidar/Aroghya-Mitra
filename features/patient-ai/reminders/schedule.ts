/**
 * Turns confirmed medicines into dose times and a notification plan.
 * Pure functions on local time, no Expo imports, so it is unit-tested directly.
 *
 * Why a rolling window instead of repeating triggers:
 *  - iOS keeps at most 64 pending local notifications per app
 *  - repeating DAILY triggers cannot stop after "5 days"
 * So we schedule individual DATE triggers for the next few days and re-plan
 * whenever the app opens or a reminder fires.
 */
import { DOSE_SLOTS, type DoseSlot, type MealRelation } from '../types';

export interface ReminderMedicine {
  id: string;
  name: string;
  dose: string | null; // "1 tablet"
  slots: DoseSlot[];
  mealRelation: MealRelation | null;
  /** First day of the course, local date YYYY-MM-DD. */
  startDate: string;
  /** null means ongoing (no end date). */
  durationDays: number | null;
  asNeeded: boolean;
  /** Paused medicines keep their history but get no reminders. */
  paused?: boolean;
}

/** The user's usual meal or routine times, HH:MM, editable in settings. */
export type SlotTimes = Record<DoseSlot, string>;
export const DEFAULT_SLOT_TIMES: SlotTimes = { morning: '08:00', afternoon: '13:00', evening: '18:00', night: '21:00' };

/** Minutes relative to the slot time. Slot times are treated as meal times. */
export const MEAL_OFFSET_MINUTES: Record<MealRelation, number> = {
  empty_stomach: -60,
  before_food: -30,
  with_food: 0,
  after_food: 15,
  any: 0,
};

export interface Dose {
  /** Stable across re-plans: `${medicineId}@${courseDate}#${slot}`. Used as the key for Taken/Skipped logs. */
  id: string;
  medicineId: string;
  medicineName: string;
  dose: string | null;
  slot: DoseSlot;
  /** Course day this dose belongs to (may differ from the calendar day of `at` when an offset crosses midnight). */
  courseDate: string;
  at: Date;
}

export interface NotificationPlan {
  /** Notification identifier. Same time → same id, so sync is idempotent. */
  id: string;
  at: Date;
  doseIds: string[];
  medicineNames: string[];
}

// ------------------------------------------------------------------ dates

export function parseHHMM(s: string): { h: number; m: number } {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!match) throw new RangeError(`Invalid time "${s}", expected HH:MM`);
  return { h: Number(match[1]), m: Number(match[2]) };
}

export function parseDateKey(key: string): { y: number; mo: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new RangeError(`Invalid date "${key}", expected YYYY-MM-DD`);
  return { y: Number(match[1]), mo: Number(match[2]), d: Number(match[3]) };
}

/** Local calendar date of a Date as YYYY-MM-DD. */
export function toDateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Add whole days to a date key, using local calendar arithmetic (safe across DST and month ends). */
export function addDays(key: string, days: number): string {
  const { y, mo, d } = parseDateKey(key);
  return toDateKey(new Date(y, mo - 1, d + days, 12)); // noon avoids DST edge hours
}

/** Local time of a dose. Negative offsets roll back across midnight automatically. */
export function doseTime(courseDate: string, slot: DoseSlot, meal: MealRelation | null, slotTimes: SlotTimes = DEFAULT_SLOT_TIMES): Date {
  const { y, mo, d } = parseDateKey(courseDate);
  const { h, m } = parseHHMM(slotTimes[slot]);
  return new Date(y, mo - 1, d, h, m + MEAL_OFFSET_MINUTES[meal ?? 'any'], 0, 0);
}

// ------------------------------------------------------------------ doses

/** All doses of a medicine whose time falls in [from, to). As-needed and paused medicines have none. */
export function expandDoses(med: ReminderMedicine, from: Date, to: Date, slotTimes: SlotTimes = DEFAULT_SLOT_TIMES): Dose[] {
  if (med.asNeeded || med.paused || med.slots.length === 0) return [];
  if (med.durationDays !== null && !(med.durationDays > 0)) return [];

  const slots = DOSE_SLOTS.filter((s) => med.slots.includes(s));
  // Start one day early so a dose shifted before midnight is not missed.
  const firstDay = maxKey(med.startDate, addDays(toDateKey(from), -1));
  const lastDay = med.durationDays === null ? addDays(toDateKey(to), 1) : addDays(med.startDate, med.durationDays - 1);
  const out: Dose[] = [];
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    for (const slot of slots) {
      const at = doseTime(day, slot, med.mealRelation, slotTimes);
      if (at >= from && at < to) {
        out.push({ id: doseId(med.id, day, slot), medicineId: med.id, medicineName: med.name, dose: med.dose, slot, courseDate: day, at });
      }
    }
    if (day > toDateKey(to)) break;
  }
  return out;
}

export function doseId(medicineId: string, courseDate: string, slot: DoseSlot): string {
  return `${medicineId}@${courseDate}#${slot}`;
}

function maxKey(a: string, b: string): string {
  return a > b ? a : b;
}

/** Last course day of a medicine, or null when ongoing. */
export function courseEndDate(med: ReminderMedicine): string | null {
  return med.durationDays === null ? null : addDays(med.startDate, med.durationDays - 1);
}

// ------------------------------------------------------------------ notification plan

export interface PlanOptions {
  slotTimes?: SlotTimes;
  /** How far ahead to schedule. */
  horizonDays?: number;
  /** Stay under iOS's 64 pending notifications, leaving room for other app notifications. */
  maxPending?: number;
}

/**
 * Notifications to have scheduled right now: future doses in the horizon,
 * one notification per minute (medicines due together are grouped), soonest first, capped.
 */
export function planNotifications(meds: ReminderMedicine[], now: Date, opts: PlanOptions = {}): NotificationPlan[] {
  const horizonDays = opts.horizonDays ?? 7;
  const maxPending = opts.maxPending ?? 60;
  const to = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  const from = new Date(now.getTime() + 1000); // strictly in the future

  const byMinute = new Map<number, Dose[]>();
  for (const med of meds) {
    for (const dose of expandDoses(med, from, to, opts.slotTimes)) {
      const minute = Math.floor(dose.at.getTime() / 60_000);
      const list = byMinute.get(minute) ?? [];
      list.push(dose);
      byMinute.set(minute, list);
    }
  }

  return [...byMinute.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, maxPending)
    .map(([minute, doses]) => {
      const at = new Date(minute * 60_000);
      const sorted = [...doses].sort((a, b) => a.medicineName.localeCompare(b.medicineName));
      return {
        id: `dose-reminder:${toDateKey(at)}T${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`,
        at,
        doseIds: sorted.map((d) => d.id),
        medicineNames: sorted.map((d) => d.medicineName),
      };
    });
}
