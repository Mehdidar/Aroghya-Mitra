/** Dose timeline statuses, adherence rate and streak. Pure functions over the dose log. */
import { addDays, toDateKey, type Dose } from './schedule';

export type DoseLogStatus = 'taken' | 'skipped';

export interface DoseLogEntry {
  doseId: string;
  status: DoseLogStatus;
  /** When the user tapped. */
  at: Date;
}

export type DoseStatus = 'upcoming' | 'due' | 'taken' | 'skipped' | 'missed';

/** A dose becomes "due" this long before its time, and "missed" this long after. */
export const DUE_WINDOW_MINUTES = { before: 30, after: 120 } as const;

/** Latest entry wins, so the user can change Taken ↔ Skipped. */
export function latestLog(log: DoseLogEntry[]): Map<string, DoseLogEntry> {
  const map = new Map<string, DoseLogEntry>();
  for (const e of log) {
    const prev = map.get(e.doseId);
    if (!prev || e.at >= prev.at) map.set(e.doseId, e);
  }
  return map;
}

export function doseStatus(dose: Dose, entry: DoseLogEntry | undefined, now: Date): DoseStatus {
  if (entry) return entry.status;
  const diffMin = (now.getTime() - dose.at.getTime()) / 60_000;
  if (diffMin > DUE_WINDOW_MINUTES.after) return 'missed';
  if (diffMin >= -DUE_WINDOW_MINUTES.before) return 'due';
  return 'upcoming';
}

export interface TimelineItem {
  dose: Dose;
  status: DoseStatus;
}

export function buildTimeline(doses: Dose[], log: DoseLogEntry[], now: Date): TimelineItem[] {
  const latest = latestLog(log);
  return [...doses]
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.medicineName.localeCompare(b.medicineName))
    .map((dose) => ({ dose, status: doseStatus(dose, latest.get(dose.id), now) }));
}

/** Share of doses taken among doses whose outcome is known (taken, skipped or missed) in the last `days` days. */
export function adherenceRate(doses: Dose[], log: DoseLogEntry[], now: Date, days = 7): number | null {
  const latest = latestLog(log);
  const since = addDays(toDateKey(now), -(days - 1));
  let decided = 0;
  let taken = 0;
  for (const dose of doses) {
    if (dose.courseDate < since || dose.at > now) continue;
    const status = doseStatus(dose, latest.get(dose.id), now);
    if (status === 'due' || status === 'upcoming') continue;
    decided++;
    if (status === 'taken') taken++;
  }
  return decided === 0 ? null : taken / decided;
}

/**
 * Consecutive days, ending today, on which every scheduled dose was taken.
 * - Today counts only once all of today's doses are taken; an unfinished today does not break the streak.
 * - Days with no scheduled doses are skipped (they neither add nor break).
 */
export function adherenceStreak(doses: Dose[], log: DoseLogEntry[], now: Date): number {
  const latest = latestLog(log);
  const byDay = new Map<string, Dose[]>();
  for (const d of doses) {
    const list = byDay.get(d.courseDate) ?? [];
    list.push(d);
    byDay.set(d.courseDate, list);
  }
  const days = [...byDay.keys()].sort().reverse();
  const today = toDateKey(now);
  let streak = 0;
  for (const day of days) {
    if (day > today) continue;
    const allTaken = byDay.get(day)!.every((d) => latest.get(d.id)?.status === 'taken');
    if (allTaken) {
      streak++;
      continue;
    }
    if (day === today) {
      // In progress: only a skipped or missed dose today ends the streak.
      const failed = byDay.get(day)!.some((d) => {
        const s = doseStatus(d, latest.get(d.id), now);
        return s === 'skipped' || s === 'missed';
      });
      if (!failed) continue;
    }
    break;
  }
  return streak;
}
