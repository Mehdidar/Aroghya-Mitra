/** The availability editor's form, and its conversion to and from the server's rules. */
import { normaliseClock } from './format';
import type { AvailabilityInput, AvailabilityRule } from './types';

export type Window = { start: string; end: string };
export type Exception = { date: string; closed: boolean; start: string; end: string };
export type Form = { slotMinutes: number; weekly: Record<number, Window[]>; exceptions: Exception[] };

export const SLOT_LENGTHS = [10, 15, 20, 30];
// Monday first, as PHC timetables are written.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const emptyForm = (): Form => ({ slotMinutes: 15, weekly: {}, exceptions: [] });

export function formFromRules(rules: AvailabilityRule[]): Form {
  const f = emptyForm();
  if (rules[0]) f.slotMinutes = rules[0].slotMinutes;
  for (const r of rules) {
    if (r.weekday !== null && r.startTime && r.endTime) (f.weekly[r.weekday] ??= []).push({ start: r.startTime, end: r.endTime });
    else if (r.specificDate) f.exceptions.push({ date: r.specificDate, closed: r.closed, start: r.startTime ?? '09:00', end: r.endTime ?? '13:00' });
  }
  f.exceptions.sort((a, b) => a.date.localeCompare(b.date));
  return f;
}

/** Form → PUT body, or null if a time is not HH:MM or ends before it starts. */
export function toInput(f: Form, doctorId: string | undefined, today: string): AvailabilityInput | null {
  const win = (w: Window) => {
    const start = normaliseClock(w.start);
    const end = normaliseClock(w.end);
    return start && end && start < end ? { start, end } : null;
  };
  const weekly: AvailabilityInput['weekly'] = [];
  for (const [wd, list] of Object.entries(f.weekly)) {
    for (const w of list) {
      const ok = win(w);
      if (!ok) return null;
      weekly.push({ weekday: Number(wd), ...ok });
    }
  }
  const exceptions: AvailabilityInput['exceptions'] = [];
  for (const e of f.exceptions) {
    if (e.closed) exceptions.push({ date: e.date, closed: true });
    else {
      const ok = win(e);
      if (!ok) return null;
      exceptions.push({ date: e.date, ...ok });
    }
  }
  return { doctorId, slotMinutes: f.slotMinutes, weekly, exceptions, validFrom: today };
}

