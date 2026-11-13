/**
 * Red-flag detection: decides whether to show "Call 108" without asking the AI.
 * Pure and synchronous, so it runs on every keystroke or transcript on the phone.
 *
 * Principle: when unsure, flag. A false alarm costs a banner; a miss can cost a life.
 * Suppression only happens for clear negation ("no chest pain") and clear
 * general-knowledge questions ("what is a heart attack?").
 */
import {
  COPULAS,
  FIRST_PERSON,
  INFORMATIONAL_START,
  NEGATORS_AFTER,
  NEGATORS_BEFORE,
  RED_FLAG_TERMS,
  type RedFlagCategory,
} from './redFlagTerms';

export type { RedFlagCategory } from './redFlagTerms';

export interface EmergencyContact {
  number: string;
  /** i18n key for the label, so P1's translations apply. */
  labelKey: 'emergency.ambulance' | 'emergency.national' | 'emergency.mentalHealth';
}

export const EMERGENCY_CONTACTS = {
  ambulance: { number: '108', labelKey: 'emergency.ambulance' },
  national: { number: '112', labelKey: 'emergency.national' },
  /** Tele-MANAS, the national mental-health helpline (toll free, 24x7). */
  mentalHealth: { number: '14416', labelKey: 'emergency.mentalHealth' },
} as const satisfies Record<string, EmergencyContact>;

export interface RedFlagMatch {
  category: RedFlagCategory;
  term: string;
  language: string;
  index: number;
}

export interface RedFlagResult {
  isEmergency: boolean;
  categories: RedFlagCategory[];
  matches: RedFlagMatch[];
  /** Numbers to show, most important first. */
  contacts: EmergencyContact[];
}

interface CompiledTerm {
  category: RedFlagCategory;
  term: string;
  language: string;
  re: RegExp;
}

const LATIN = /^[\p{Script=Latin}\p{N}\s'’-]+$/u;

/** Lower-case, NFC, drop zero-width joiners, unify apostrophes, collapse spaces. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Latin terms need a word boundary on both sides ("stroke" must not match "strokes of luck" partially... it will match "strokes" via plural).
 * Indic and Perso-Arabic terms only need one at the start, because suffixes attach to the word
 * (Marathi "छातीत दुखतंय", Telugu "కరిచింది").
 */
function compile(term: string): RegExp {
  const body = escapeRegExp(normalizeText(term)).replace(/ /g, '\\s+');
  if (LATIN.test(term)) return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?:s|es)?(?![\\p{L}\\p{N}])`, 'gu');
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${body}`, 'gu');
}

const COMPILED: CompiledTerm[] = Object.entries(RED_FLAG_TERMS).flatMap(([category, rule]) =>
  Object.entries(rule.terms).flatMap(([language, terms]) =>
    terms.map((term) => ({ category: category as RedFlagCategory, term, language, re: compile(term) })),
  ),
);

const FILLER_BEFORE = new Set(['have', 'having', 'had', 'any', 'a', 'an', 'the', 'feel', 'feeling', 'felt', 'experiencing', 'got', 'get', 'getting', 'is', 'am', 'are', 'was', 'there', 'signs', 'of', 'sign']);

const tokens = (s: string) => s.split(/[\s,.;:!?।॥۔؟()"]+/u).filter(Boolean);

function isNegated(text: string, start: number, end: number): boolean {
  // English: "no chest pain", "don't have any chest pain". The negator must sit directly before the
  // symptom (only filler words between), so "it will not stop bleeding heavily" is NOT negated.
  const before = tokens(text.slice(Math.max(0, start - 60), start));
  for (let i = before.length - 1; i >= 0; i--) {
    if (NEGATORS_BEFORE.has(before[i])) return true;
    if (!FILLER_BEFORE.has(before[i])) break;
  }

  // Indian languages: "सीने में दर्द नहीं है", "நெஞ்சு வலி இல்லை". But NOT "दर्द नहीं जा रहा" (pain is not going away).
  const after = tokens(text.slice(end, end + 40));
  if (after.length > 0 && NEGATORS_AFTER.has(after[0])) {
    // Only end-of-clause, so the rest of the sentence cannot reverse the meaning.
    const clauseEnd = /^[^,.;!?।॥۔؟]*/u.exec(text.slice(end))![0];
    const clause = tokens(clauseEnd);
    return clause.length === 1 || (clause.length === 2 && COPULAS.has(clause[1]));
  }
  return false;
}

function isInformationalQuestion(text: string): boolean {
  return INFORMATIONAL_START.test(text) && !FIRST_PERSON.test(text);
}

export function detectRedFlags(input: string): RedFlagResult {
  const text = normalizeText(input);
  const matches: RedFlagMatch[] = [];
  if (!text) return { isEmergency: false, categories: [], matches, contacts: [] };
  const informational = isInformationalQuestion(text);

  for (const c of COMPILED) {
    const rule = RED_FLAG_TERMS[c.category];
    c.re.lastIndex = 0;
    for (const m of text.matchAll(c.re)) {
      const index = m.index ?? 0;
      if (!rule.ignoreNegation && isNegated(text, index, index + m[0].length)) continue;
      if (rule.allowInformational && informational) continue;
      matches.push({ category: c.category, term: c.term, language: c.language, index });
    }
  }

  matches.sort((a, b) => a.index - b.index);
  const categories = [...new Set(matches.map((m) => m.category))];
  const contacts: EmergencyContact[] = [];
  if (categories.length > 0) {
    contacts.push(EMERGENCY_CONTACTS.ambulance);
    if (categories.includes('self_harm')) contacts.unshift(EMERGENCY_CONTACTS.mentalHealth);
    contacts.push(EMERGENCY_CONTACTS.national);
  }
  return { isEmergency: categories.length > 0, categories, matches, contacts };
}
