/**
 * Universal Immunization Programme (UIP): National Immunization Schedule for
 * infants, children, adolescents and pregnant women (MoHFW).
 *
 * Data, not code: the engine (../engine.ts) reads these rows. Numbers marked
 * `uncertain` could not be confirmed against the current MoHFW document.
 */
import type { GuidelineMeta } from '../types.ts';
import { RETRIEVED_ON, REVIEW_DUE, type AgeSpec, type Rule } from './common.ts';

export const UIP: GuidelineMeta = {
  id: 'in-mohfw-uip-nis',
  title: 'National Immunization Schedule (Universal Immunization Programme)',
  issuer: 'MoHFW, Government of India',
  document: 'Universal Immunization Programme: National Immunization Schedule for Infants, Children and Pregnant Women',
  version: '2023 (fIPV 3rd dose; PCV nationwide)',
  url: 'https://www.mohfw.gov.in/sites/default/files/Universal%20Immunization%20Programme.pdf',
  retrievedOn: RETRIEVED_ON,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
  notes:
    'Schedule transcribed from the MoHFW UIP schedule as known on the retrieval date; the PDF itself was located but not parsed line by line. ' +
    'The "due by" grace period (28 days unless stated) is an app convention for showing "overdue", not a guideline number.',
};

export type VaccineGroup = 'child' | 'adolescent' | 'pregnancy';

export interface VaccineDose {
  code: string;
  dose: number;
  /** Shown as is in every language (vaccine abbreviations stay Latin). */
  label: string;
  group: VaccineGroup;
  /** Earliest age. */
  from: AgeSpec;
  /** Recommended latest age; after it the dose shows as overdue. Default: from + 28 days. */
  dueBy?: AgeSpec;
  /** After this age the dose is no longer given (window closed). Null: no upper limit stated. */
  lastAge: AgeSpec | null;
  /** The previous dose in the series that must come first, with the minimum gap. */
  after?: { code: string; dose: number; minDays: number };
  jeEndemicOnly?: boolean;
  /** prevent:reason.<reason> */
  reason: string;
}

const W6 = { w: 6 };
const W10 = { w: 10 };
const W14 = { w: 14 };
const M9 = { m: 9 };
const M12 = { m: 12 };
const M16 = { m: 16 };
const M24 = { m: 24 };
const Y1 = { y: 1 };
const Y5 = { y: 5 };

export const CHILD_DOSES: Rule<VaccineDose>[] = [
  { code: 'bcg', dose: 1, label: 'BCG', group: 'child', from: { d: 0 }, lastAge: Y1, reason: 'vBcg' },
  { code: 'hepb', dose: 0, label: 'Hep B-0', group: 'child', from: { d: 0 }, dueBy: { d: 1 }, lastAge: { d: 1 }, reason: 'vHepb', note: 'Birth dose within 24 hours of birth.' },
  { code: 'opv', dose: 0, label: 'OPV-0', group: 'child', from: { d: 0 }, dueBy: { d: 15 }, lastAge: { d: 15 }, reason: 'vOpv', note: 'Within the first 15 days.' },

  { code: 'opv', dose: 1, label: 'OPV-1', group: 'child', from: W6, lastAge: Y5, reason: 'vOpv' },
  { code: 'opv', dose: 2, label: 'OPV-2', group: 'child', from: W10, lastAge: Y5, after: { code: 'opv', dose: 1, minDays: 28 }, reason: 'vOpv' },
  { code: 'opv', dose: 3, label: 'OPV-3', group: 'child', from: W14, lastAge: Y5, after: { code: 'opv', dose: 2, minDays: 28 }, reason: 'vOpv' },

  { code: 'penta', dose: 1, label: 'Penta-1', group: 'child', from: W6, lastAge: Y1, reason: 'vPenta' },
  { code: 'penta', dose: 2, label: 'Penta-2', group: 'child', from: W10, lastAge: Y1, after: { code: 'penta', dose: 1, minDays: 28 }, reason: 'vPenta' },
  { code: 'penta', dose: 3, label: 'Penta-3', group: 'child', from: W14, lastAge: Y1, after: { code: 'penta', dose: 2, minDays: 28 }, reason: 'vPenta' },

  { code: 'rvv', dose: 1, label: 'RVV-1', group: 'child', from: W6, lastAge: Y1, reason: 'vRvv', uncertain: true, note: 'Upper age limit (1 year) and catch-up rules for later doses to be confirmed.' },
  { code: 'rvv', dose: 2, label: 'RVV-2', group: 'child', from: W10, lastAge: Y1, after: { code: 'rvv', dose: 1, minDays: 28 }, reason: 'vRvv', uncertain: true },
  { code: 'rvv', dose: 3, label: 'RVV-3', group: 'child', from: W14, lastAge: Y1, after: { code: 'rvv', dose: 2, minDays: 28 }, reason: 'vRvv', uncertain: true },

  { code: 'fipv', dose: 1, label: 'fIPV-1', group: 'child', from: W6, lastAge: Y1, reason: 'vFipv', uncertain: true, note: 'Upper age limit not confirmed.' },
  { code: 'fipv', dose: 2, label: 'fIPV-2', group: 'child', from: W14, lastAge: Y1, after: { code: 'fipv', dose: 1, minDays: 56 }, reason: 'vFipv', uncertain: true, note: 'Minimum gap of 8 weeks after fIPV-1 to be confirmed.' },
  { code: 'fipv', dose: 3, label: 'fIPV-3', group: 'child', from: M9, dueBy: M12, lastAge: null, after: { code: 'fipv', dose: 2, minDays: 28 }, reason: 'vFipv', uncertain: true, note: 'Third fIPV dose at 9 months (introduced 2023). Secondary sources disagree on whether it is national or state protocol.' },

  { code: 'pcv', dose: 1, label: 'PCV-1', group: 'child', from: W6, lastAge: Y1, reason: 'vPcv', uncertain: true, note: 'Upper age limit not confirmed.' },
  { code: 'pcv', dose: 2, label: 'PCV-2', group: 'child', from: W14, lastAge: Y1, after: { code: 'pcv', dose: 1, minDays: 56 }, reason: 'vPcv', uncertain: true },
  { code: 'pcv', dose: 3, label: 'PCV-B', group: 'child', from: M9, dueBy: M12, lastAge: null, after: { code: 'pcv', dose: 2, minDays: 28 }, reason: 'vPcv', uncertain: true, note: 'Booster at 9 months; upper age limit not confirmed.' },

  { code: 'mr', dose: 1, label: 'MR-1', group: 'child', from: M9, dueBy: M12, lastAge: Y5, reason: 'vMr' },
  { code: 'mr', dose: 2, label: 'MR-2', group: 'child', from: M16, dueBy: M24, lastAge: Y5, after: { code: 'mr', dose: 1, minDays: 28 }, reason: 'vMr' },

  { code: 'je', dose: 1, label: 'JE-1', group: 'child', from: M9, dueBy: M12, lastAge: null, jeEndemicOnly: true, reason: 'vJe', uncertain: true, note: 'Only in JE-endemic districts; upper age limit not confirmed.' },
  { code: 'je', dose: 2, label: 'JE-2', group: 'child', from: M16, dueBy: M24, lastAge: null, jeEndemicOnly: true, after: { code: 'je', dose: 1, minDays: 28 }, reason: 'vJe', uncertain: true },

  { code: 'dpt', dose: 1, label: 'DPT-B1', group: 'child', from: M16, dueBy: M24, lastAge: { y: 7 }, reason: 'vDpt' },
  { code: 'opv', dose: 4, label: 'OPV-B', group: 'child', from: M16, dueBy: M24, lastAge: Y5, reason: 'vOpv' },
  { code: 'dpt', dose: 2, label: 'DPT-B2', group: 'child', from: Y5, dueBy: { y: 6 }, lastAge: { y: 7 }, reason: 'vDpt' },

  { code: 'td', dose: 1, label: 'Td (10 y)', group: 'adolescent', from: { y: 10 }, dueBy: { y: 11 }, lastAge: null, reason: 'vTd' },
  { code: 'td', dose: 2, label: 'Td (16 y)', group: 'adolescent', from: { y: 16 }, dueBy: { y: 17 }, lastAge: null, reason: 'vTd' },

  // Vitamin A: 1st dose at 9 months with MR-1, 2nd at 16 months, then every 6 months to 5 years (9 doses).
  { code: 'vita', dose: 1, label: 'Vitamin A-1', group: 'child', from: M9, dueBy: M12, lastAge: Y5, reason: 'vVita' },
  ...[2, 3, 4, 5, 6, 7, 8, 9].map(
    (n): Rule<VaccineDose> => ({
      code: 'vita',
      dose: n,
      label: `Vitamin A-${n}`,
      group: 'child',
      from: { m: 16 + (n - 2) * 6 },
      lastAge: Y5,
      after: { code: 'vita', dose: n - 1, minDays: n === 2 ? 28 : 150 },
      reason: 'vVita',
      ...(n > 2 ? { uncertain: true, note: 'Doses 3-9 every 6 months up to 5 years; the minimum gap used (150 days) is an app assumption.' } : {}),
    }),
  ),
];

/** Pregnant women: Td-1 early in pregnancy, Td-2 four weeks later; one booster if two doses were given in a pregnancy in the last 3 years. */
export const PREGNANCY_TD = {
  td1: { code: 'td_pregnancy', dose: 1, label: 'Td-1', reason: 'vTdPregnancy' },
  td2: { code: 'td_pregnancy', dose: 2, label: 'Td-2', minDaysAfterTd1: 28, reason: 'vTdPregnancy' },
  booster: { code: 'td_pregnancy_booster', dose: 1, label: 'Td-Booster', reason: 'vTdPregnancy' },
  /** Two doses in a previous pregnancy within this many years: one booster only. */
  boosterIfTwoDosesWithinYears: 3,
  /** Td-2 (or the booster) should be done before this gestation week. */
  completeByWeek: 36,
  uncertain: true,
  note: '"Before 36 weeks" for Td-2/booster is from older TT guidance; confirm. Td is given whenever she comes, even late in pregnancy.',
} as const;

/** Every vaccine code the server accepts in a record. */
export const VACCINE_CODES = [...new Set([...CHILD_DOSES.map((d) => d.code), PREGNANCY_TD.td1.code, PREGNANCY_TD.booster.code])];
