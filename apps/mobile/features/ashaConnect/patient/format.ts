/**
 * Dates for the patient's "My ASHA" screen, in India time and the app
 * language (Kashmiri falls back to Urdu, then English, as the strings do).
 */
import { IST, formatTime, localesFor } from '@/features/appointments/format';
import type { LanguageCode } from '@/features/shared/i18n/languages';

function fmt(iso: string, lang: LanguageCode, opts: Intl.DateTimeFormatOptions): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  for (const locales of [localesFor(lang), ['en-IN']]) {
    try {
      return new Intl.DateTimeFormat(locales, { ...opts, timeZone: IST }).format(at);
    } catch {
      // try the next locale list
    }
  }
  return iso.slice(0, 10);
}

/** "Tue, 18 Nov": a day the ASHA said she will come. */
export const formatVisitDay = (iso: string, lang: LanguageCode) => fmt(iso, lang, { weekday: 'short', day: 'numeric', month: 'short' });

/** "12 Nov 2026": a past date (last visit, request sent). */
export const formatPastDate = (iso: string, lang: LanguageCode) => fmt(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' });

/** Time of a message; the day too when it is not today. */
export function formatStamp(iso: string, lang: LanguageCode, now = new Date()): string {
  const time = formatTime(iso, lang);
  const sameDay = fmt(iso, 'en', { year: 'numeric', month: '2-digit', day: '2-digit' }) === fmt(now.toISOString(), 'en', { year: 'numeric', month: '2-digit', day: '2-digit' });
  return sameDay ? time : `${fmt(iso, lang, { day: 'numeric', month: 'short' })}, ${time}`;
}

/** First name for short status lines ("Sunita will visit on ..."). */
export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;
