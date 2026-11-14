/** Shared shapes for the guideline data files. Ages are calendar offsets from a date. */
import type { Uncertainty } from '../types.ts';

export interface AgeSpec {
  d?: number;
  w?: number;
  m?: number;
  y?: number;
}

/** Review dates for this data set. Every file is unreviewed until a clinician signs it off. */
export const RETRIEVED_ON = '2026-11-14';
export const REVIEW_DUE = '2027-05-14';

export type Rule<T> = T & Uncertainty;
