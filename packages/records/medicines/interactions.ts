/**
 * Small curated drug–drug interaction table for the doctor's prescription
 * check (AI copilot, feature F).
 *
 * Only well-established, clinically significant pairs relevant to primary
 * care, each with a severity and a source. This is NOT a complete interaction
 * checker: an empty result does not mean "no interaction".
 *
 * SOURCES: BNF (British National Formulary) Appendix 1 "Interactions";
 * Stockley's Drug Interactions; US FDA prescribing information (where named).
 * STATUS: every row needs clinical review before real use.
 *
 * A side is a medicine id from catalog.ts or a drug class ("class:nsaid").
 */
import type { DrugClass } from './catalog.ts';

export type InteractionSeverity = 'major' | 'moderate';

export interface Interaction {
  id: string;
  a: string[];
  b: string[];
  severity: InteractionSeverity;
  /** English, shown to the doctor. */
  effect: string;
  advice: string;
  source: string;
  reviewStatus: 'needs_clinical_review';
}

const BNF = 'BNF Appendix 1 (Interactions); Stockley’s Drug Interactions';
const cls = (c: DrugClass) => `class:${c}`;

function x(id: string, a: string[], b: string[], severity: InteractionSeverity, effect: string, advice: string, source = BNF): Interaction {
  return { id, a, b, severity, effect, advice, source, reviewStatus: 'needs_clinical_review' };
}

export const INTERACTIONS: Interaction[] = [
  x('warfarin_nsaid', ['warfarin'], [cls('nsaid'), cls('aspirin')], 'major', 'Higher bleeding risk (antiplatelet effect and GI irritation on top of anticoagulation).', 'Avoid; use paracetamol for pain. If unavoidable, monitor INR and for bleeding.'),
  x('warfarin_metronidazole', ['warfarin'], ['metronidazole'], 'major', 'Metronidazole raises the INR markedly.', 'Avoid or reduce warfarin dose and check INR within 3–5 days.'),
  x('warfarin_cotrimoxazole', ['warfarin'], ['cotrimoxazole'], 'major', 'Co-trimoxazole raises the INR; serious bleeding reported.', 'Avoid; choose another antibiotic or monitor INR closely.'),
  x('warfarin_fluconazole', ['warfarin'], ['fluconazole'], 'major', 'Fluconazole inhibits warfarin metabolism and raises the INR.', 'Monitor INR closely; consider dose reduction.'),
  x('warfarin_ciprofloxacin', ['warfarin'], ['ciprofloxacin'], 'moderate', 'Ciprofloxacin can raise the INR.', 'Monitor INR during and after the course.'),
  x('warfarin_rifampicin', ['warfarin'], ['rifampicin'], 'major', 'Rifampicin induces warfarin metabolism: anticoagulation is lost.', 'Expect large dose changes; monitor INR closely, also after stopping rifampicin.'),
  x('raas_potassium_sparing', [cls('ace_inhibitor'), cls('arb')], ['spironolactone'], 'major', 'Risk of severe hyperkalaemia.', 'Check potassium and creatinine before and after starting; avoid in renal impairment.'),
  x('ace_arb_dual', [cls('ace_inhibitor')], [cls('arb')], 'major', 'Dual RAAS blockade: hyperkalaemia, hypotension and kidney injury without extra benefit.', 'Do not combine.'),
  x('raas_nsaid', [cls('ace_inhibitor'), cls('arb')], [cls('nsaid')], 'moderate', 'NSAIDs reduce the BP-lowering effect and raise the risk of kidney injury (worse with a diuretic).', 'Prefer paracetamol; if needed, short course and check creatinine.'),
  x('statin_macrolide', ['atorvastatin'], ['clarithromycin', 'erythromycin'], 'major', 'Clarithromycin/erythromycin raise statin levels: myopathy and rhabdomyolysis.', 'Pause the statin during the course or use azithromycin.'),
  x('clopidogrel_omeprazole', ['clopidogrel'], ['omeprazole'], 'moderate', 'Omeprazole reduces activation of clopidogrel (less antiplatelet effect).', 'Use pantoprazole if a PPI is needed.', `${BNF}; US FDA clopidogrel labeling`),
  x('methotrexate_cotrimoxazole', ['methotrexate'], ['cotrimoxazole'], 'major', 'Both are folate antagonists: bone-marrow suppression.', 'Avoid the combination.'),
  x('tramadol_ssri', ['tramadol'], [cls('ssri'), cls('tricyclic')], 'major', 'Serotonin syndrome and lowered seizure threshold.', 'Avoid; choose another analgesic.'),
  x('opioid_benzodiazepine', [cls('opioid')], [cls('benzodiazepine')], 'major', 'Additive sedation and respiratory depression.', 'Avoid; if unavoidable, lowest doses and warn the patient.', `${BNF}; US FDA boxed warning (2016)`),
  x('digoxin_clarithromycin', ['digoxin'], ['clarithromycin', 'erythromycin'], 'major', 'Macrolides raise digoxin levels: toxicity.', 'Avoid or monitor digoxin level and pulse.'),
  x('quinolone_cations', ['ciprofloxacin'], [cls('iron'), cls('calcium')], 'moderate', 'Iron and calcium bind ciprofloxacin and stop it being absorbed.', 'Take ciprofloxacin 2 hours before or 6 hours after iron/calcium.'),
  x('tetracycline_cations', ['doxycycline'], [cls('iron'), cls('calcium')], 'moderate', 'Iron and calcium bind doxycycline and reduce absorption.', 'Separate doses by at least 2–3 hours.'),
  x('levothyroxine_cations', ['levothyroxine'], [cls('iron'), cls('calcium')], 'moderate', 'Iron and calcium reduce levothyroxine absorption.', 'Take levothyroxine on an empty stomach, 4 hours apart from iron/calcium.'),
  x('sulfonylurea_fluconazole', [cls('sulfonylurea')], ['fluconazole'], 'moderate', 'Fluconazole raises sulfonylurea levels: hypoglycaemia.', 'Warn the patient; monitor blood sugar.'),
  x('nsaid_duplicate', [cls('nsaid')], [cls('nsaid'), cls('aspirin')], 'moderate', 'Two NSAIDs together: more GI bleeding and kidney risk, no extra pain relief.', 'Use one NSAID only.'),
  x('valproate_carbamazepine_note', ['carbamazepine'], ['valproate'], 'moderate', 'Carbamazepine lowers valproate levels; valproate raises carbamazepine-epoxide.', 'Specialist monitoring of levels and side effects.'),
];

export const INTERACTION_SOURCE = { sources: BNF, count: INTERACTIONS.length, status: 'needs clinical review' } as const;
