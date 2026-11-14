/** Rashtriya Bal Swasthya Karyakram (RBSK): child health screening for the 4Ds. */
import type { GuidelineMeta } from '../types.ts';
import { REVIEW_DUE, type Rule } from './common.ts';

export const RBSK: GuidelineMeta = {
  id: 'in-nhm-rbsk',
  title: 'Child health screening (RBSK): defects, diseases, deficiencies, developmental delays',
  issuer: 'NHM, MoHFW',
  document: 'Rashtriya Bal Swasthya Karyakram: Operational Guidelines',
  version: '2013',
  url: null,
  retrievedOn: null,
  reviewDue: REVIEW_DUE,
  reviewedBy: null,
  status: 'needs_clinical_review',
};

/** Mobile health team screening: twice a year at the anganwadi (6 weeks to 6 years), once a year at school (6-18 years). */
export const RBSK_SCREENING: Rule<{ anganwadi: { fromWeeks: number; toYears: number; perYear: number }; school: { fromYears: number; toYears: number; perYear: number } }> = {
  anganwadi: { fromWeeks: 6, toYears: 6, perYear: 2 },
  school: { fromYears: 6, toYears: 18, perYear: 1 },
};
