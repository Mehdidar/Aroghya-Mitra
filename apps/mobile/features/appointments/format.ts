/**
 * Dates and times for appointments, always in India time (Asia/Kolkata), in
 * the app language via Intl. If the phone's Intl lacks a locale or time-zone
 * support, it falls back to English / a plain 'HH:MM' so a time is never wrong.
 */
import { LANGUAGES, type LanguageCode } from '@/features/shared/i18n/languages';

export const IST = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60_000;

export function localesFor(lang: LanguageCode): string[] {
  const own = LANGUAGES[lang]?.bcp47 ?? 'en-IN';
  // Kashmiri falls back to Urdu (same script), then English, as the strings do.
  return lang === 'ks' ? [own, 'ur-IN', 'en-IN'] : [own, 'en-IN'];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The IST calendar date ('YYYY-MM-DD') of an instant. */
export function istDateOf(at: Date | string): string {
  return new Date(new Date(at).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' plus n days. */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function format(at: Date, lang: LanguageCode, opts: Intl.DateTimeFormatOptions, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat(localesFor(lang), { ...opts, timeZone }).format(at);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone }).format(at);
    } catch {
      return null;
    }
  }
}

/** "9:30 am" style time of an instant, in IST. */
export function formatTime(iso: string, lang: LanguageCode): string {
  const at = new Date(iso);
  const s = format(at, lang, { hour: 'numeric', minute: '2-digit' }, IST);
  if (s) return s;
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  return `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

/** "Mon, 16 Nov" style day of an IST date ('YYYY-MM-DD'). */
export function formatDay(date: string, lang: LanguageCode, long = false): string {
  // Noon UTC on that date is the same calendar day everywhere we format it (UTC).
  const at = new Date(`${date}T12:00:00Z`);
  return format(at, lang, long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }, 'UTC') ?? date;
}

/** Day and time of an instant, in IST. */
export function formatWhen(iso: string, lang: LanguageCode): string {
  return `${formatDay(istDateOf(iso), lang, true)}, ${formatTime(iso, lang)}`;
}

/** Weekday name (0 = Sunday). 15 Nov 2026 is a Sunday. */
export function weekdayName(weekday: number, lang: LanguageCode, style: 'long' | 'short' = 'long'): string {
  const at = new Date(Date.UTC(2026, 10, 15 + weekday, 12));
  return format(at, lang, { weekday: style }, 'UTC') ?? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday];
}

/** 'HH:MM' wall-clock (24 h) shown in the app language's time format. */
export function formatClock(hhmm: string, lang: LanguageCode): string {
  const [h, m] = hhmm.split(':').map(Number);
  const at = new Date(Date.UTC(2026, 0, 1, h, m));
  return format(at, lang, { hour: 'numeric', minute: '2-digit' }, 'UTC') ?? hhmm;
}

export const isClock = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/** Accepts '9:00', '0900', '9' and returns 'HH:MM', or null. */
export function normaliseClock(input: string): string | null {
  const s = input.trim().replace(/[.\s]/g, ':');
  let m = /^(\d{1,2})(?::(\d{2}))?$/.exec(s);
  if (!m && /^\d{3,4}$/.test(s)) m = /^(\d{1,2})(\d{2})$/.exec(s);
  if (!m) return null;
  const out = `${pad(Number(m[1]))}:${m[2] ?? '00'}`;
  return isClock(out) ? out : null;
}
