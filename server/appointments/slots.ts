/**
 * Slot generation: published availability minus active appointments, in IST.
 *
 * Pure functions, no I/O, so the same rules are unit-tested and used by the
 * booking check (a booking is accepted only for a slot this function returns).
 * Nothing here invents a time: no availability rows means no slots.
 */
import { isActive, type Appointment, type AvailabilityRule, type Slot } from './types.ts';

/** Asia/Kolkata is UTC+05:30 all year (India has no daylight saving). */
export const IST_OFFSET_MINUTES = 330;
export const TIME_ZONE = 'Asia/Kolkata';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isDate = (s: unknown): s is string => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const isTime = (s: unknown): s is string => typeof s === 'string' && TIME_RE.test(s);

/** 'HH:MM' (or 'HH:MM:SS' from Postgres) → minutes after midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** The IST calendar date of an instant. */
export function istDate(at: Date | string): string {
  const t = new Date(at).getTime() + IST_OFFSET_MINUTES * MINUTE;
  return new Date(t).toISOString().slice(0, 10);
}

/** The instant of an IST wall-clock time on an IST date. */
export function istInstant(date: string, minutes: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + (minutes - IST_OFFSET_MINUTES) * MINUTE);
}

/** 0 = Sunday … 6 = Saturday, for an IST date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Every IST date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

const inValidity = (r: AvailabilityRule, date: string) => (!r.validFrom || r.validFrom <= date) && (!r.validTo || date <= r.validTo);

/**
 * The windows a doctor works on one date. A date exception for that date
 * replaces the weekly hours; if any exception closes the day, there are none.
 */
export function windowsFor(rules: AvailabilityRule[], doctorId: string, date: string): AvailabilityRule[] {
  const mine = rules.filter((r) => r.doctorId === doctorId && inValidity(r, date));
  const exceptions = mine.filter((r) => r.specificDate === date);
  if (exceptions.length) return exceptions.some((r) => r.closed) ? [] : exceptions.filter((r) => r.startTime && r.endTime);
  const dow = weekdayOf(date);
  return mine.filter((r) => r.specificDate === null && r.weekday === dow && !r.closed && r.startTime && r.endTime);
}

export interface SlotQuery {
  rules: AvailabilityRule[];
  /** Appointments that may overlap; only active ones (booked / confirmed) block a slot. */
  appointments: Pick<Appointment, 'doctorId' | 'startsAt' | 'endsAt' | 'status'>[];
  /** IST dates, inclusive. */
  from: string;
  to: string;
  now: Date;
  doctorId?: string;
  /** Slots starting sooner than this are not offered (default 0: anything in the future). */
  minLeadMinutes?: number;
}

/** Free slots, sorted by start time then doctor. */
export function generateSlots(q: SlotQuery): Slot[] {
  const doctors = [...new Set(q.rules.map((r) => r.doctorId))].filter((d) => !q.doctorId || d === q.doctorId);
  const earliest = q.now.getTime() + (q.minLeadMinutes ?? 0) * MINUTE;
  const busy = q.appointments
    .filter((a) => isActive(a.status))
    .map((a) => ({ doctorId: a.doctorId, start: Date.parse(a.startsAt), end: Date.parse(a.endsAt) }));
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const date of datesBetween(q.from, q.to)) {
    for (const doctorId of doctors) {
      for (const w of windowsFor(q.rules, doctorId, date)) {
        const step = Math.max(5, w.slotMinutes);
        const end = minutesOf(w.endTime!);
        for (let m = minutesOf(w.startTime!); m + step <= end; m += step) {
          const start = istInstant(date, m).getTime();
          const stop = start + step * MINUTE;
          if (start <= earliest) continue;
          const key = `${doctorId}|${start}`;
          if (seen.has(key)) continue;
          if (busy.some((b) => b.doctorId === doctorId && b.start < stop && start < b.end)) continue;
          seen.add(key);
          out.push({ doctorId, facilityId: w.facilityId, startsAt: new Date(start).toISOString(), endsAt: new Date(stop).toISOString() });
        }
      }
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.doctorId.localeCompare(b.doctorId));
}

/** The free slot that starts exactly at `startsAt` for this doctor, or null. */
export function findSlot(q: Omit<SlotQuery, 'from' | 'to'> & { doctorId: string; startsAt: string }): Slot | null {
  const t = Date.parse(q.startsAt);
  if (Number.isNaN(t)) return null;
  const date = istDate(new Date(t));
  const iso = new Date(t).toISOString();
  return generateSlots({ ...q, from: date, to: date }).find((s) => s.startsAt === iso && s.doctorId === q.doctorId) ?? null;
}

/** IST start and end instants of a date range, for querying appointments. */
export function rangeInstants(from: string, to: string): { start: string; end: string } {
  return { start: istInstant(from, 0).toISOString(), end: istInstant(addDays(to, 1), 0).toISOString() };
}
