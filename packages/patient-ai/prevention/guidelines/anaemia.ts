/**
 * Anemia Mukt Bharat (AMB, Intensified National Iron Plus Initiative): Hb
 * cut-offs by group, prophylactic IFA doses, deworming and follow-up.
 */
import type { GuidelineMeta } from '../types.ts';
import { RETRIEVED_ON, REVIEW_DUE, type Rule } from './common.ts';

export const AMB: GuidelineMeta = {
  id: 'in-mohfw-amb',
  title: 'Anemia Mukt Bharat: prophylaxis, testing and treatment of anaemia',
  issuer: 'MoHFW, Government of India',
  document: 'Anemia Mukt Bharat: Intensified National Iron Plus Initiative (I-NIPI) Operational Guidelines for Programme Managers',
  version: '2018',
  url: 'https://anemiamuktbharat.info',
  retrievedOn: RETRIEVED_ON,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
  notes:
    'Doses checked against secondary summaries (Vikaspedia, 2026-11-14), not the operational guideline PDF. Hb cut-offs follow WHO 2011 as adopted by AMB. ' +
    '"Biweekly" for children 6-59 months means twice a week in AMB; one summary reads it as every two weeks.',
};

export type AnaemiaGroup = 'child_6_59m' | 'child_5_11y' | 'adolescent_12_14y' | 'woman' | 'man' | 'pregnant';

/** Hb (g/dL) below `anaemiaBelow` is anaemia; severity bands below that. */
export const HB_THRESHOLDS: Record<AnaemiaGroup, Rule<{ anaemiaBelow: number; moderateBelow: number; severeBelow: number }>> = {
  child_6_59m: { anaemiaBelow: 11, moderateBelow: 10, severeBelow: 7 },
  child_5_11y: { anaemiaBelow: 11.5, moderateBelow: 11, severeBelow: 8 },
  adolescent_12_14y: { anaemiaBelow: 12, moderateBelow: 11, severeBelow: 8 },
  woman: { anaemiaBelow: 12, moderateBelow: 11, severeBelow: 8 },
  man: { anaemiaBelow: 13, moderateBelow: 11, severeBelow: 8 },
  pregnant: { anaemiaBelow: 11, moderateBelow: 10, severeBelow: 7 },
};

/** Days after an anaemic Hb result before it should be re-tested. */
export const RECHECK_DAYS: Rule<{ mild: number; moderate: number; pregnantAny: number }> = {
  mild: 90,
  moderate: 30,
  pregnantAny: 30,
  uncertain: true,
  note: 'Recheck intervals are not confirmed against the AMB treatment protocol; severe anaemia is referred at once whatever the interval.',
};

export type IfaRegimen = 'ifa_syrup' | 'ifa_pink' | 'ifa_blue' | 'ifa_red_weekly' | 'ifa_red_daily';

/** Prophylactic IFA by group (AMB 6x6x6 strategy). */
export const IFA_PROPHYLAXIS: Rule<{ regimen: IfaRegimen; who: string; dose: string }>[] = [
  { regimen: 'ifa_syrup', who: '6-59 months', dose: '1 ml IFA syrup (20 mg iron + 100 mcg folic acid), twice a week' },
  { regimen: 'ifa_pink', who: '5-9 years', dose: '1 pink IFA tablet (45 mg iron + 400 mcg folic acid), once a week' },
  { regimen: 'ifa_blue', who: '10-19 years', dose: '1 blue IFA tablet (60 mg iron + 500 mcg folic acid), once a week' },
  { regimen: 'ifa_red_weekly', who: 'Women 20-49 years, not pregnant or breastfeeding', dose: '1 red IFA tablet (60 mg iron + 500 mcg folic acid), once a week' },
  { regimen: 'ifa_red_daily', who: 'Pregnant (from the 4th month, 180 days) and breastfeeding (180 days after birth)', dose: '1 red IFA tablet (60 mg iron + 500 mcg folic acid), daily' },
];

export const IFA_PREGNANCY: Rule<{ fromWeek: number; days: number; postpartumDays: number }> = { fromWeek: 14, days: 180, postpartumDays: 180 };

/** Deworming (National Deworming Day, February and August): 1-19 years. */
export const DEWORMING: Rule<{ fromYears: number; toYears: number; halfDoseUnderYears: number; months: number[] }> = {
  fromYears: 1,
  toYears: 19,
  halfDoseUnderYears: 2,
  months: [2, 8],
  note: 'Albendazole 200 mg (half tablet) for 1-2 years, 400 mg for 2-19 years, twice a year.',
};
