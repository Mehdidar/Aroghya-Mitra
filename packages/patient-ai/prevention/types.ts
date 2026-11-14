/**
 * Preventive care: shared types for the guideline data (./guidelines/*) and
 * the pure plan engine (./engine.ts). Dates are calendar days (YYYY-MM-DD);
 * the engine never reads the clock or the network.
 */

export type GuidelineStatus = 'needs_clinical_review' | 'reviewed' | 'retired';

/** Where a rule came from. Every plan item and flag carries one of these. */
export interface GuidelineMeta {
  id: string;
  title: string;
  /** e.g. MoHFW, NHM, ICMR, WHO (adopted by MoHFW). */
  issuer: string;
  /** The source document's name as issued. */
  document: string;
  /** Version or year of the source document. */
  version: string;
  /** Official URL, or null when it could not be verified online. */
  url: string | null;
  /** Day the source was last checked (YYYY-MM-DD), or null. */
  retrievedOn: string | null;
  /** When this data must be re-checked against the source. */
  reviewDue: string;
  /** Clinician who signed off this data. Null until a clinical review happens. */
  reviewedBy: string | null;
  status: GuidelineStatus;
  /** Free-text caveats about the data as a whole. */
  notes?: string;
}

/** Marks a number or rule we could not confirm against the source document. */
export interface Uncertainty {
  uncertain?: boolean;
  note?: string;
}

export interface GuidelineRef {
  id: string;
  version: string;
  status: GuidelineStatus;
  /** True when the specific rule behind this item is not confirmed. */
  uncertain?: boolean;
}

// ----------------------------------------------------------------- the person

export type Sex = 'female' | 'male' | 'other';

export interface VaccinationRecord {
  id?: string;
  vaccineCode: string;
  dose: number;
  givenOn: string;
  givenBy?: string | null;
  batch?: string | null;
  source?: 'asha' | 'doctor' | 'facility' | 'self_reported' | 'demo';
}

export interface GrowthMeasurement {
  id?: string;
  measuredOn: string;
  weightKg?: number | null;
  heightCm?: number | null;
  muacCm?: number | null;
  measuredBy?: string | null;
}

export type ScreeningKind = 'bp' | 'sugar' | 'hb' | 'oral' | 'breast' | 'cervical' | 'anc' | 'ultrasound';

export interface ScreeningResult {
  id?: string;
  kind: ScreeningKind;
  screenedOn: string;
  by?: string | null;
  /**
   * bp: { systolic, diastolic }   sugar: { mgdl, fasting? }   hb: { gdl }
   * oral/breast/cervical: { result: 'normal' | 'abnormal' | 'referred' }
   * anc: { visit? }  ultrasound: { note? }
   */
  value: Record<string, unknown>;
}

export interface PreventionPerson {
  id?: string;
  /** Date of birth (YYYY-MM-DD). */
  dob: string | null;
  sex: Sex | null;
  pregnancy?: { lmp: string; gravida?: number } | null;
  /** Postpartum: the day the last baby was born (IFA/calcium continue for 180 days). */
  deliveredOn?: string | null;
  birthWeightKg?: number | null;
  /** Free text conditions, e.g. 'hypertension', 'diabetes', 'Gestational hypertension'. */
  conditions?: string[];
  /** Japanese encephalitis endemic district: adds JE doses. */
  jeEndemic?: boolean;
  /** ASHA home visit days (YYYY-MM-DD), used for the HBNC newborn visits. */
  homeVisits?: string[];
  vaccinations?: VaccinationRecord[];
  growth?: GrowthMeasurement[];
  screenings?: ScreeningResult[];
}

// ------------------------------------------------------------------ the plan

export type PlanStatus = 'overdue' | 'due' | 'upcoming' | 'ongoing' | 'done' | 'missed';

export type PlanCategory = 'vaccine' | 'pregnancy' | 'newborn' | 'child' | 'anaemia' | 'ncd' | 'cancer';

export interface PlanItem {
  /** Stable id, e.g. 'uip:penta:2', 'anc:visit:3', 'ncd:bp'. */
  id: string;
  category: PlanCategory;
  /** Translation code (prevent:item.<code>), or a vaccine code for vaccines. */
  code: string;
  /** For vaccines: the Latin label shown in every language, e.g. 'Penta-2'. */
  label?: string;
  dose?: number;
  status: PlanStatus;
  /** First day it is due (YYYY-MM-DD). */
  dueFrom: string | null;
  /** Last recommended day; after this it is overdue. */
  dueBy: string | null;
  /** After this the dose is no longer given (window closed). */
  lastDay?: string | null;
  doneOn?: string | null;
  /** Plain-language reason: prevent:reason.<code>, with params. */
  reason: { code: string; params?: Record<string, string | number> };
  guideline: GuidelineRef;
}

export type FlagLevel = 'info' | 'warning' | 'urgent';

export interface PlanFlag {
  code: string;
  level: FlagLevel;
  params?: Record<string, string | number>;
  guideline: GuidelineRef;
}

export interface PreventionPlan {
  asOf: string;
  ageDays: number | null;
  gestationWeeks: number | null;
  items: PlanItem[];
  flags: PlanFlag[];
  /** Guidelines that produced at least one item or flag. */
  guidelines: GuidelineMeta[];
}
