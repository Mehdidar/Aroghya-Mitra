/**
 * NP-NCD (formerly NPCDCS): population-based screening of everyone aged 30
 * and above for hypertension, diabetes and oral, breast and cervical cancer.
 */
import type { GuidelineMeta } from '../types.ts';
import { RETRIEVED_ON, REVIEW_DUE, type Rule } from './common.ts';

export const NPNCD: GuidelineMeta = {
  id: 'in-mohfw-npncd',
  title: 'Population-based screening for common NCDs (age 30+)',
  issuer: 'MoHFW, Government of India',
  document: 'National Programme for Prevention and Control of Non-Communicable Diseases (NP-NCD) Operational Guidelines',
  version: '2023-2030',
  url: 'https://www.mohfw.gov.in/sites/default/files/NP-NCD%20Operational%20Guidelines_0.pdf',
  retrievedOn: RETRIEVED_ON,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
  notes:
    'Scope (30+, five NCDs) confirmed from the 2023 guideline summary. Intervals (BP and sugar yearly; cancers every 5 years) come from MoHFW training and planning documents, not the 2023 text itself. ' +
    'The 90-day grace before "overdue" is an app convention. The CBAC form is filled by the ASHA before screening.',
};

export interface ScreeningRule {
  kind: 'bp' | 'sugar' | 'oral' | 'breast' | 'cervical';
  fromAge: number;
  toAge: number | null;
  sex: 'any' | 'female';
  everyYears: number;
  /** Known conditions that mean the person is already under care (no screening; follow-up instead). */
  skipIf: RegExp[];
}

export const SCREENINGS: Rule<ScreeningRule>[] = [
  { kind: 'bp', fromAge: 30, toAge: null, sex: 'any', everyYears: 1, skipIf: [/hypertension/i], uncertain: true, note: 'Yearly interval from MoHFW training material.' },
  { kind: 'sugar', fromAge: 30, toAge: null, sex: 'any', everyYears: 1, skipIf: [/diabetes/i], uncertain: true, note: 'Yearly interval from MoHFW training material.' },
  { kind: 'oral', fromAge: 30, toAge: null, sex: 'any', everyYears: 5, skipIf: [] },
  { kind: 'breast', fromAge: 30, toAge: null, sex: 'female', everyYears: 5, skipIf: [] },
  { kind: 'cervical', fromAge: 30, toAge: 65, sex: 'female', everyYears: 5, skipIf: [], uncertain: true, note: 'VIA every 5 years; the upper age limit of 65 is not confirmed.' },
];

export const GRACE_DAYS = 90;

/** Screening thresholds: refer to the Medical Officer for confirmation. */
export const BP_THRESHOLDS: Rule<{ systolic: number; diastolic: number; urgentSystolic: number; urgentDiastolic: number }> = {
  systolic: 140,
  diastolic: 90,
  urgentSystolic: 180,
  urgentDiastolic: 110,
  uncertain: true,
  note: '140/90 is the NP-NCD referral threshold; 180/110 for "urgent" is an app choice (hypertensive crisis), not an NP-NCD number.',
};

/** In pregnancy: 140/90 or more needs the doctor the same day (MCP card). */
export const BP_PREGNANCY: Rule<{ systolic: number; diastolic: number; severeSystolic: number; severeDiastolic: number }> = {
  systolic: 140,
  diastolic: 90,
  severeSystolic: 160,
  severeDiastolic: 110,
};

export const SUGAR_THRESHOLDS: Rule<{ randomMgdl: number; fastingMgdl: number }> = {
  randomMgdl: 140,
  fastingMgdl: 126,
  uncertain: true,
  note: 'Random capillary glucose 140 mg/dL or more: refer for confirmation (NP-NCD screening). Fasting 126 mg/dL is the WHO diagnostic cut-off.',
};
