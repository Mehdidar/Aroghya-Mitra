/**
 * Child growth: WHO Child Growth Standards (2006) as printed on India's
 * Mother and Child Protection (MCP) card, plus MUAC cut-offs and the growth
 * monitoring schedule.
 *
 * The LMS rows below are a sparse subset (key ages, linearly interpolated)
 * typed from memory of the WHO tables, NOT copied from the WHO files: every
 * z-score from them is marked uncertain until the full monthly tables
 * (https://www.who.int/tools/child-growth-standards) replace them.
 */
import type { GuidelineMeta } from '../types.ts';
import { REVIEW_DUE, type Rule } from './common.ts';

export const GROWTH: GuidelineMeta = {
  id: 'in-mohfw-growth-who2006',
  title: 'Child growth monitoring (WHO Child Growth Standards on the MCP card)',
  issuer: 'MoHFW / MWCD (MCP card); WHO (growth standards)',
  document: 'Mother and Child Protection Card; WHO Child Growth Standards: weight-for-age, length/height-for-age',
  version: 'MCP card 2018; WHO 2006',
  url: 'https://www.who.int/tools/child-growth-standards',
  retrievedOn: null,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
  notes: 'LMS values are a sparse, unverified subset; replace with the full WHO monthly tables before clinical use.',
};

/** [ageMonths, L, M, S] */
export type LmsRow = [number, number, number, number];

export const WEIGHT_FOR_AGE: Rule<{ boys: LmsRow[]; girls: LmsRow[] }> = {
  uncertain: true,
  note: 'Sparse WHO weight-for-age LMS subset, from memory; verify.',
  boys: [
    [0, 0.3487, 3.3464, 0.14602], [1, 0.2297, 4.4709, 0.13395], [2, 0.197, 5.5675, 0.12385], [3, 0.1738, 6.3762, 0.11727],
    [4, 0.1553, 7.0023, 0.11316], [6, 0.1257, 7.934, 0.10958], [9, 0.0917, 8.9014, 0.10881], [12, 0.0644, 9.6479, 0.10925],
    [18, 0.0062, 10.9385, 0.11143], [24, -0.0137, 12.1515, 0.11426], [36, -0.0606, 14.3429, 0.12189], [48, -0.0979, 16.3489, 0.12853], [60, -0.1317, 18.3366, 0.13390],
  ],
  girls: [
    [0, 0.3809, 3.2322, 0.14171], [1, 0.1714, 4.1873, 0.13724], [2, 0.0962, 5.1282, 0.13], [3, 0.0402, 5.8458, 0.12619],
    [4, -0.005, 6.4237, 0.12402], [6, -0.0756, 7.297, 0.12204], [9, -0.1557, 8.2254, 0.12239], [12, -0.2024, 8.9481, 0.12268],
    [18, -0.2316, 10.2315, 0.12689], [24, -0.2353, 11.4775, 0.13015], [36, -0.2134, 13.8503, 0.13759], [48, -0.2130, 16.0697, 0.14463], [60, -0.2286, 18.2193, 0.15018],
  ],
};

export const HEIGHT_FOR_AGE: Rule<{ boys: LmsRow[]; girls: LmsRow[] }> = {
  uncertain: true,
  note: 'Sparse WHO length/height-for-age subset (L = 1), from memory; verify. Length under 2 years, height from 2 years.',
  boys: [
    [0, 1, 49.8842, 0.03795], [3, 1, 61.4292, 0.03328], [6, 1, 67.6236, 0.03165], [9, 1, 71.9687, 0.03204], [12, 1, 75.7488, 0.03137],
    [18, 1, 82.2587, 0.03279], [24, 1, 87.1161, 0.03507], [36, 1, 96.0835, 0.03791], [48, 1, 103.3273, 0.04009], [60, 1, 110.0, 0.04190],
  ],
  girls: [
    [0, 1, 49.1477, 0.0379], [3, 1, 59.8029, 0.0364], [6, 1, 65.7311, 0.03448], [9, 1, 70.1435, 0.03496], [12, 1, 74.015, 0.03479],
    [18, 1, 80.7079, 0.03642], [24, 1, 85.7153, 0.03764], [36, 1, 95.0515, 0.04004], [48, 1, 102.7312, 0.04185], [60, 1, 109.4233, 0.04328],
  ],
};

/** MCP card colour bands for weight-for-age: green >= -2 SD, yellow -2 to -3 (underweight), red below -3 (severely underweight). */
export const Z_CUTOFFS = { moderate: -2, severe: -3 };

/** MUAC, children 6-59 months (WHO 2009, MoHFW SAM guidelines). */
export const MUAC: Rule<{ fromMonths: number; toMonths: number; samBelowCm: number; mamBelowCm: number }> = {
  fromMonths: 6,
  toMonths: 59,
  samBelowCm: 11.5,
  mamBelowCm: 12.5,
};

/** Low birth weight below 2.5 kg (WHO / MoHFW). */
export const LOW_BIRTH_WEIGHT_KG = 2.5;

/** Faltering: no weight gain between two weighings at least this many days apart (MCP card: a flat or falling curve). */
export const FALTER: Rule<{ minGapDays: number; maxAgeMonths: number; newbornRegainByDay: number }> = {
  minGapDays: 28,
  maxAgeMonths: 60,
  newbornRegainByDay: 14,
  uncertain: true,
  note: 'The 28-day minimum gap and "back to birth weight by day 14" are app conventions consistent with HBNC/MCP counselling, not quoted numbers.',
};

/** Growth monitoring at the anganwadi: monthly under 3 years, every 3 months from 3 to 6 years (ICDS). */
export const GROWTH_MONITORING: Rule<{ monthlyUntilMonths: number; quarterlyUntilMonths: number }> = {
  monthlyUntilMonths: 36,
  quarterlyUntilMonths: 72,
  uncertain: true,
  note: 'ICDS schedule as commonly practised; confirm with the MCP card / Poshan Tracker protocol.',
};
