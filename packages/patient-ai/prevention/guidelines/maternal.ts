/**
 * Maternal and newborn care: ANC visits, PMSMA, calcium, ultrasound, danger
 * signs, birth preparedness and Home Based Newborn Care (HBNC).
 */
import type { GuidelineMeta } from '../types.ts';
import { RETRIEVED_ON, REVIEW_DUE, type Rule } from './common.ts';

export const ANC: GuidelineMeta = {
  id: 'in-mohfw-anc',
  title: 'Antenatal care: visits, tests and counselling',
  issuer: 'MoHFW, Government of India',
  document: 'Guidelines for Antenatal Care and Skilled Attendance at Birth by ANMs/LHVs/SNs; Mother and Child Protection (MCP) Card',
  version: '2010 (ANC guidelines); MCP card 2018',
  url: null,
  retrievedOn: null,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
  notes: 'Not verified online in this build. WHO 2016 (8 contacts) is listed for reference only; MoHFW adoption is not confirmed, so the plan uses the MoHFW minimum of 4 visits.',
};

export const PMSMA: GuidelineMeta = {
  id: 'in-mohfw-pmsma',
  title: 'Pradhan Mantri Surakshit Matritva Abhiyan (PMSMA)',
  issuer: 'MoHFW, Government of India',
  document: 'PMSMA operational framework',
  version: '2016',
  url: null,
  retrievedOn: null,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
};

export const CALCIUM: GuidelineMeta = {
  id: 'in-mohfw-calcium',
  title: 'Calcium supplementation during pregnancy and lactation',
  issuer: 'MoHFW (Maternal Health Division)',
  document: 'National Guidelines for Calcium Supplementation During Pregnancy and Lactation',
  version: '2014',
  url: null,
  retrievedOn: null,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
};

export const HBNC: GuidelineMeta = {
  id: 'in-mohfw-hbnc',
  title: 'Home Based Newborn Care (HBNC) visits by ASHA',
  issuer: 'MoHFW / NHM',
  document: 'Home Based Newborn Care Operational Guidelines (revised)',
  version: '2014',
  url: null,
  retrievedOn: null,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
};

/** MoHFW minimum: 4 ANC visits, the first (registration) within 12 weeks. Weeks of gestation from LMP. */
export const ANC_VISITS: Rule<{ visit: number; fromWeek: number; byWeek: number }>[] = [
  { visit: 1, fromWeek: 0, byWeek: 12 },
  { visit: 2, fromWeek: 14, byWeek: 26 },
  { visit: 3, fromWeek: 28, byWeek: 34 },
  { visit: 4, fromWeek: 36, byWeek: 40 },
];

/** Reference only (not scheduled): WHO 2016 eight-contact model. */
export const WHO_2016_CONTACT_WEEKS: Rule<{ weeks: number[] }> = {
  weeks: [12, 20, 26, 30, 34, 36, 38, 40],
  uncertain: true,
  note: 'WHO 2016 ANC model; whether MoHFW has formally adopted 8 contacts is not confirmed.',
};

export const PMSMA_RULES: Rule<{ dayOfMonth: number; fromWeek: number; toWeek: number }> = {
  dayOfMonth: 9,
  fromWeek: 13,
  toWeek: 40,
  uncertain: true,
  note: '2nd and 3rd trimester check-up by a doctor on the 9th of every month. When the 9th is a Sunday or holiday it moves to the next working day: not modelled.',
};

export const CALCIUM_RULES: Rule<{ fromWeek: number; days: number; postpartumDays: number; dose: string }> = {
  fromWeek: 14,
  days: 180,
  postpartumDays: 180,
  dose: '500 mg elemental calcium + vitamin D3, twice a day',
};

export const FOLIC_ACID_RULES: Rule<{ untilWeek: number; dose: string }> = {
  untilWeek: 12,
  dose: 'Folic acid 400 mcg daily in the first trimester',
};

export const ALBENDAZOLE_PREGNANCY: Rule<{ fromWeek: number; byWeek: number; dose: string }> = {
  fromWeek: 14,
  byWeek: 27,
  dose: 'Albendazole 400 mg once, in the second trimester',
};

export const ULTRASOUND_RULES: Rule<{ fromWeek: number; byWeek: number }> = {
  fromWeek: 18,
  byWeek: 22,
  uncertain: true,
  note: 'At least one ultrasound in the 2nd trimester (PMSMA offers it); the 18-22 week window is the usual anomaly-scan window, not a confirmed MoHFW number.',
};

export const BIRTH_PLAN_RULES: Rule<{ fromWeek: number; byWeek: number }> = {
  fromWeek: 28,
  byWeek: 36,
  uncertain: true,
  note: 'Birth preparedness is counselled throughout ANC; the 28-36 week timing is an app choice. JSY/JSSK: free delivery and transport (102/108) at public facilities.',
};

/** MCP card danger signs: go to hospital at once. Codes map to prevent:danger.<code>. */
export const DANGER_SIGNS = ['bleeding', 'headache_vision', 'convulsions', 'fever', 'swelling', 'fetal_movement', 'water_break', 'abdominal_pain', 'breathless'] as const;

/** Conditions that make a pregnancy high risk: plan delivery at a hospital with specialist care (FRU / CEmONC). */
export const HIGH_RISK_CONDITIONS = [/hypertension/i, /pre-?eclampsia/i, /diabetes/i, /severe anaemia|severe anemia/i, /heart/i, /twin/i, /previous (c-?section|caesarean)/i];

/** HBNC: ASHA home visits on these days after birth (institutional birth; a home birth adds day 1). */
export const HBNC_DAYS: Rule<{ days: number[]; homeBirthExtraDay: number; matchToleranceDays: number }> = {
  days: [3, 7, 14, 21, 28, 42],
  homeBirthExtraDay: 1,
  matchToleranceDays: 2,
  uncertain: true,
  note: 'Visit days per HBNC 2014. Matching a recorded visit within 2 days of the scheduled day is an app convention; extra visits for low birth weight babies are not modelled.',
};
