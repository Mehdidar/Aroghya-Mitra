/**
 * Allergy and pregnancy rules for the prescription check (AI copilot, feature F).
 *
 * SOURCES: BNF chapters on hypersensitivity (penicillin, cephalosporin cross-
 * sensitivity) and "Prescribing in pregnancy"; US FDA labeling (PLLR) and the
 * FDA Drug Safety Communication of 15 Oct 2020 on NSAIDs at 20 weeks or later;
 * MoHFW antenatal care guidance. STATUS: needs clinical review.
 *
 * These are warnings for the doctor, never automatic decisions.
 */
import type { DrugClass, Medicine } from './catalog.ts';
import { MEDICINES } from './catalog.ts';

// ---- allergy ------------------------------------------------------------------

export interface AllergyRule {
  id: string;
  /** Words in the patient's allergy list that mean this allergy. */
  matches: RegExp;
  /** Medicines that must not be given: contraindicated. */
  avoidClasses: DrugClass[];
  /** Cross-reactive classes: caution. */
  cautionClasses: DrugClass[];
  note: string;
  source: string;
  reviewStatus: 'needs_clinical_review';
}

const SRC_ALLERGY = 'BNF: penicillins, cephalosporins, sulfonamides, NSAIDs (hypersensitivity)';
const a = (id: string, matches: RegExp, avoidClasses: DrugClass[], cautionClasses: DrugClass[], note: string): AllergyRule => ({ id, matches, avoidClasses, cautionClasses, note, source: SRC_ALLERGY, reviewStatus: 'needs_clinical_review' });

export const ALLERGY_RULES: AllergyRule[] = [
  a('penicillin', /penicillin|amoxi|ampicillin|cloxacillin|augmentin|co-?amoxiclav|beta[- ]?lactam/i, ['penicillin'], ['cephalosporin'], 'Penicillin allergy: all penicillins (amoxicillin, co-amoxiclav, ampicillin, cloxacillin, benzathine penicillin) are contraindicated. Cephalosporins carry a small cross-reactivity risk; avoid after anaphylaxis.'),
  a('cephalosporin', /cephalosporin|cef|ceph/i, ['cephalosporin'], ['penicillin'], 'Cephalosporin allergy: avoid cephalosporins; penicillins with caution.'),
  a('sulfa', /sulfa|sulpha|sulfonamide|co-?trimoxazole|septran|bactrim/i, ['sulfonamide_antibiotic'], [], 'Sulfonamide antibiotic allergy: avoid co-trimoxazole.'),
  a('nsaid', /nsaid|aspirin|ibuprofen|diclofenac|brufen|salicylate/i, ['nsaid', 'aspirin'], [], 'NSAID/aspirin hypersensitivity: avoid NSAIDs and aspirin (cross-reactive). Paracetamol is usually tolerated.'),
  a('macrolide', /macrolide|azithro|erythro|clarithro/i, ['macrolide'], [], 'Macrolide allergy: avoid azithromycin, clarithromycin, erythromycin.'),
  a('quinolone', /quinolone|cipro|levoflox|ofloxacin/i, ['fluoroquinolone'], [], 'Fluoroquinolone allergy: avoid ciprofloxacin and related.'),
  a('tetracycline', /tetracycline|doxy/i, ['tetracycline'], [], 'Tetracycline allergy: avoid doxycycline.'),
];

export interface AllergyHit {
  ruleId: string;
  allergy: string;
  level: 'contraindicated' | 'caution';
  note: string;
  source: string;
}

/** Which of the patient's allergies this medicine hits. Also matches the medicine named directly in the allergy list. */
export function allergyHits(med: Medicine | null, medicineName: string, allergies: string[]): AllergyHit[] {
  const hits: AllergyHit[] = [];
  const lower = medicineName.toLowerCase();
  for (const raw of allergies) {
    const allergy = raw.trim();
    if (!allergy || /^(none|nil|no known|nkda)/i.test(allergy)) continue;
    let matched = false;
    for (const rule of ALLERGY_RULES) {
      if (!rule.matches.test(allergy) || !med) continue;
      if (med.classes.some((c) => rule.avoidClasses.includes(c))) {
        hits.push({ ruleId: rule.id, allergy, level: 'contraindicated', note: rule.note, source: rule.source });
        matched = true;
      } else if (med.classes.some((c) => rule.cautionClasses.includes(c))) {
        hits.push({ ruleId: rule.id, allergy, level: 'caution', note: rule.note, source: rule.source });
        matched = true;
      }
    }
    // "Allergy: Metformin" and the doctor types metformin.
    if (!matched) {
      const word = allergy.toLowerCase().replace(/\s*allergy\s*/g, '').trim();
      const names = med ? [med.generic.toLowerCase(), med.id.replace(/_/g, ' '), ...med.aliases] : [];
      if (word.length >= 4 && (lower.includes(word) || names.some((n) => n.length >= 4 && (n.includes(word) || word.includes(n))))) {
        hits.push({ ruleId: 'named', allergy, level: 'contraindicated', note: `The record lists an allergy to ${allergy}.`, source: 'Patient record' });
      }
    }
  }
  return hits;
}

// ---- pregnancy ----------------------------------------------------------------

export type PregnancyLevel = 'contraindicated' | 'avoid' | 'caution';

export interface PregnancyRule {
  id: string;
  medicines?: string[];
  classes?: DrugClass[];
  level: PregnancyLevel;
  /** The flag applies from this week (e.g. NSAIDs from 20 weeks). Undefined: the whole pregnancy. */
  fromWeek?: number;
  note: string;
  source: string;
  reviewStatus: 'needs_clinical_review';
}

const SRC_PREG = 'BNF "Prescribing in pregnancy"; US FDA labeling (PLLR)';
const p = (id: string, target: { medicines?: string[]; classes?: DrugClass[] }, level: PregnancyLevel, note: string, extra: { fromWeek?: number; source?: string } = {}): PregnancyRule => ({ id, ...target, level, note, fromWeek: extra.fromWeek, source: extra.source ?? SRC_PREG, reviewStatus: 'needs_clinical_review' });

export const PREGNANCY_RULES: PregnancyRule[] = [
  p('ace_inhibitor', { classes: ['ace_inhibitor'] }, 'contraindicated', 'ACE inhibitors are fetotoxic (kidney damage, oligohydramnios, skull defects), mainly in the 2nd and 3rd trimesters. Use labetalol, nifedipine or methyldopa for BP in pregnancy.'),
  p('arb', { classes: ['arb'] }, 'contraindicated', 'ARBs are fetotoxic like ACE inhibitors. Use labetalol, nifedipine or methyldopa.'),
  p('statin', { classes: ['statin'] }, 'contraindicated', 'Statins: stop in pregnancy (no benefit; possible fetal harm).'),
  p('nsaid_20w', { classes: ['nsaid'] }, 'avoid', 'NSAIDs from 20 weeks: fetal kidney problems and low amniotic fluid; from about 30 weeks also premature closure of the ductus arteriosus. Use paracetamol. (Low-dose aspirin for pre-eclampsia prevention is a separate, supervised use.)', { fromWeek: 20, source: 'US FDA Drug Safety Communication, 15 Oct 2020 (NSAIDs at ≥20 weeks); BNF' }),
  p('warfarin', { medicines: ['warfarin'] }, 'contraindicated', 'Warfarin is teratogenic (embryopathy in weeks 6–12) and causes fetal bleeding. Specialist care: heparin is used instead.'),
  p('isotretinoin', { classes: ['retinoid'] }, 'contraindicated', 'Isotretinoin is highly teratogenic. Never in pregnancy.'),
  p('methotrexate', { classes: ['antimetabolite'] }, 'contraindicated', 'Methotrexate is teratogenic and abortifacient.'),
  p('misoprostol', { classes: ['prostaglandin'] }, 'contraindicated', 'Misoprostol causes uterine contractions and abortion; only for specific obstetric indications under supervision.'),
  p('valproate', { medicines: ['valproate'] }, 'avoid', 'Valproate: high risk of neural tube and other birth defects and developmental harm. Specialist review.'),
  p('antiepileptic', { medicines: ['carbamazepine', 'phenytoin'] }, 'caution', 'Teratogenic risk; do not stop suddenly. Specialist review and folic acid 5 mg.'),
  p('tetracycline', { classes: ['tetracycline'] }, 'avoid', 'Tetracyclines stain teeth and affect bone growth in the fetus (after about 15 weeks).'),
  p('fluoroquinolone', { classes: ['fluoroquinolone'] }, 'caution', 'Fluoroquinolones: avoid in pregnancy when a safer antibiotic exists.'),
  p('cotrimoxazole', { classes: ['sulfonamide_antibiotic'] }, 'caution', 'Co-trimoxazole: folate antagonist in the 1st trimester; neonatal jaundice risk near term.'),
  p('spironolactone', { medicines: ['spironolactone'] }, 'avoid', 'Spironolactone: anti-androgen effects on the fetus.'),
  p('atenolol', { medicines: ['atenolol'] }, 'caution', 'Atenolol is linked to fetal growth restriction; labetalol is preferred in pregnancy.'),
  p('carbimazole', { medicines: ['carbimazole'] }, 'caution', 'Carbimazole in the 1st trimester: possible birth defects. Specialist review.'),
  p('sulfonylurea', { classes: ['sulfonylurea'] }, 'caution', 'Insulin (or metformin) is preferred in pregnancy; specialist review.'),
  p('benzodiazepine', { classes: ['benzodiazepine'] }, 'caution', 'Near term: neonatal sedation and withdrawal.'),
  p('opioid', { classes: ['opioid'] }, 'caution', 'Regular use near term: neonatal withdrawal and breathing problems.'),
];

export interface PregnancyContext {
  pregnant: boolean;
  weeks: number | null;
}

export interface PregnancyHit {
  ruleId: string;
  level: PregnancyLevel;
  note: string;
  source: string;
  /** True when the rule starts at a week we could not confirm (weeks unknown). */
  weeksUnknown: boolean;
}

export function pregnancyHits(med: Medicine | null, ctx: PregnancyContext): PregnancyHit[] {
  if (!med || !ctx.pregnant) return [];
  const hits: PregnancyHit[] = [];
  for (const rule of PREGNANCY_RULES) {
    const hit = rule.medicines?.includes(med.id) || rule.classes?.some((c) => med.classes.includes(c));
    if (!hit) continue;
    if (rule.fromWeek !== undefined && ctx.weeks !== null && ctx.weeks < rule.fromWeek) continue;
    hits.push({ ruleId: rule.id, level: rule.level, note: rule.note, source: rule.source, weeksUnknown: rule.fromWeek !== undefined && ctx.weeks === null });
  }
  return hits;
}

/**
 * Is the patient pregnant, and how many weeks? From what the record says:
 * conditions ("Gestational hypertension", "Pregnancy"), and the most recent
 * texts that give a week ("BP 150/100 at 34 weeks", "28 weeks"). Texts are
 * newest first. Unknown is `{ pregnant: false, weeks: null, basis: null }`:
 * the doctor can still mark the patient pregnant on the screen.
 */
export function pregnancyFromRecord(conditions: string[], textsNewestFirst: string[]): PregnancyContext & { basis: string | null } {
  const cond = conditions.find((c) => /pregnan|gestation|antenatal|\banc\b/i.test(c) && !/post-?partum|history of/i.test(c));
  let weeks: number | null = null;
  let basis: string | null = cond ?? null;
  for (const t of textsNewestFirst) {
    const m = /\b(\d{1,2})\s*(?:weeks?|wks?)\b/i.exec(t ?? '');
    if (m && (cond || /pregnan|gestation|antenatal|\bat\s+\d{1,2}\s*w/i.test(t))) {
      const w = Number(m[1]);
      if (w >= 4 && w <= 42) {
        weeks = w;
        basis = basis ?? t;
        break;
      }
    }
  }
  return { pregnant: Boolean(cond) || weeks !== null, weeks, basis };
}

/** For callers that have only an id. */
export const medicineById = (id: string) => MEDICINES.find((m) => m.id === id) ?? null;
