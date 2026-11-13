import type { ISODate, Patient, Visit } from '../types';

const DAY_MS = 86_400_000;

const toDate = (d: ISODate | Date) => (d instanceof Date ? d : new Date(d));

export function ageDays(dob: ISODate, at: ISODate | Date = new Date()): number {
  return Math.floor((toDate(at).getTime() - toDate(dob).getTime()) / DAY_MS);
}

export function ageYears(dob: ISODate, at: ISODate | Date = new Date()): number {
  const b = toDate(dob);
  const a = toDate(at);
  let years = a.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    a.getUTCMonth() < b.getUTCMonth() ||
    (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) years -= 1;
  return Math.max(0, years);
}

/** Completed weeks of gestation from the last menstrual period. */
export function gestationWeeks(lmp: ISODate, at: ISODate | Date = new Date()): number {
  return Math.floor(ageDays(lmp, at) / 7);
}

/** Pregnant and the LMP is plausible (not older than 44 weeks). */
export function isPregnant(p: Patient, at: ISODate | Date = new Date()): boolean {
  if (!p.categories.includes('pregnant') || !p.pregnancy?.lmp) return false;
  const ga = gestationWeeks(p.pregnancy.lmp, at);
  return ga >= 0 && ga <= 44;
}

/** Young infant (IMNCI 0–59 days), or explicitly registered as a newborn. */
export function isNewborn(p: Patient, at: ISODate | Date = new Date()): boolean {
  const days = ageDays(p.dob, at);
  return days >= 0 && (days <= 59 || (p.categories.includes('newborn') && days <= 90));
}

/** Expected date of delivery (Naegele: LMP + 280 days). */
export function eddFromLmp(lmp: ISODate): ISODate {
  return new Date(toDate(lmp).getTime() + 280 * DAY_MS).toISOString();
}

export function lmpFromWeeks(weeks: number, at: Date = new Date()): ISODate {
  return new Date(at.getTime() - weeks * 7 * DAY_MS).toISOString();
}

export function dobFromAge(years: number, days = 0, at: Date = new Date()): ISODate {
  const d = new Date(at.getTime() - days * DAY_MS);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString();
}

export function addDays(at: Date, days: number): ISODate {
  return new Date(at.getTime() + days * DAY_MS).toISOString();
}

export function startOfDay(at: Date = new Date()): Date {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Latest visit per patient (by visitedAt). */
export function latestVisitByPatient(visits: Iterable<Visit>): Map<string, Visit> {
  const out = new Map<string, Visit>();
  for (const v of visits) {
    const cur = out.get(v.patientId);
    if (!cur || v.visitedAt > cur.visitedAt) out.set(v.patientId, v);
  }
  return out;
}

/** Patients whose latest visit asked for a follow-up on or before the end of `at`'s day. */
export function followUpsDue(visits: Iterable<Visit>, at: Date = new Date()): Visit[] {
  const end = startOfDay(at).getTime() + DAY_MS;
  return [...latestVisitByPatient(visits).values()]
    .filter((v) => v.followUpOn && Date.parse(v.followUpOn) < end)
    .sort((a, b) => (a.followUpOn! < b.followUpOn! ? -1 : 1));
}

export function formatDate(d: ISODate): string {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
}

/** Parses YYYY-MM-DD or DD/MM/YYYY (as typed by field workers). */
export function parseDateInput(s: string): ISODate | undefined {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return safeDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return safeDate(+m[3], +m[2], +m[1]);
  return undefined;
}

function safeDate(y: number, mo: number, d: number): ISODate | undefined {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return dt.toISOString();
}
