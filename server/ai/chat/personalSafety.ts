/**
 * Personal safety rules: run on the patient's message + their record context
 * BEFORE the model, so the most important warnings never depend on the AI.
 *
 * Each rule is small and explicit. Matching is on the original message and,
 * when the server has it, an English translation. When unsure, warn.
 *
 *   allergy_match          the message names a medicine or food that matches a recorded allergy (or its drug family)
 *   nsaid_pregnancy        pregnant ≥ 20 weeks and asks about an NSAID painkiller
 *   ace_arb_pregnancy      pregnant and asks about an ACE inhibitor / ARB blood-pressure medicine
 *   preg_htn_warning_sign  pregnant with high BP and describes headache, blurred vision, swelling, upper abdominal pain
 *                          or reduced baby movement → treated as an emergency (108)
 *   preg_danger_sign       pregnant (no high BP on record) and describes blurred vision, upper abdominal pain or
 *                          reduced baby movement → emergency (108)
 *   high_salt_bp           high BP on record and asks about salty food (pickle, papad, namkeen, ...)
 *   dose_change            on a current medicine and talks about stopping, skipping or changing a dose
 *
 * Texts are clinical content: they must be reviewed (docs/CLINICAL_REVIEW.md).
 * The app shows its own translation of each code (locales/<lang>/assistant.json
 * warning.<code>) and falls back to `text`.
 */
import { hasHypertension, type ContextLabel, type PatientContext } from './patientContext.ts';

export type WarningCode = 'allergy_match' | 'nsaid_pregnancy' | 'ace_arb_pregnancy' | 'preg_htn_warning_sign' | 'preg_danger_sign' | 'high_salt_bp' | 'dose_change';

export interface PersonalWarning {
  code: WarningCode;
  /** English text (the server translates it for other languages). */
  text: string;
  /** Values the app's own translation interpolates. */
  params: Record<string, string | number>;
  /** True: show the 108 emergency path instead of an AI answer. */
  escalate: boolean;
  /** Which parts of the record the rule used. */
  uses: ContextLabel[];
}

/** Word-start match for Latin terms (allows plural / -ing endings); substring for Indic and Perso-Arabic scripts. */
function termRegex(terms: string[]): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const latin = terms.filter((t) => /^[\x20-\x7e]+$/.test(t)).map(esc);
  const other = terms.filter((t) => !/^[\x20-\x7e]+$/.test(t)).map(esc);
  const parts = [];
  if (latin.length) parts.push(`(?<![\\p{L}\\p{N}])(?:${latin.join('|')})(?:s|es|ing|ed|y)?(?![\\p{L}\\p{N}])`);
  if (other.length) parts.push(`(?:${other.join('|')})`);
  return new RegExp(parts.join('|'), 'iu');
}

const NEGATED = /\b(?:no|not|never|without|don't have|do not have|dont have|nahi|nahin)\b[^.,;!?]{0,25}$/i;

/** First match of `re` in `text` that is not directly negated ("no headache", "not swollen"). */
function findTerm(text: string, re: RegExp): string | null {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) {
    const before = text.slice(0, m.index);
    if (!NEGATED.test(before)) return m[0];
  }
  return null;
}

// ----------------------------------------------------------------- lexicons

export const DRUG_FAMILIES: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'amoxycillin', 'amoxyclav', 'augmentin', 'clavam', 'novamox', 'ampicillin', 'cloxacillin', 'dicloxacillin', 'flucloxacillin', 'piperacillin', 'benzathine'],
  sulfa: ['sulfa', 'sulpha', 'sulfamethoxazole', 'cotrimoxazole', 'co-trimoxazole', 'septran', 'bactrim'],
  nsaid: ['nsaid', 'ibuprofen', 'brufen', 'combiflam', 'diclofenac', 'voveran', 'naproxen', 'mefenamic', 'meftal', 'ketorolac', 'nimesulide', 'aceclofenac', 'zerodol', 'indomethacin', 'piroxicam', 'etoricoxib', 'aspirin', 'disprin', 'ecosprin'],
};

/** NSAIDs for the pregnancy rule. Aspirin is left out: low-dose aspirin is often prescribed in pregnancy to prevent pre-eclampsia. */
const NSAIDS_PREGNANCY = DRUG_FAMILIES.nsaid.filter((d) => !['aspirin', 'disprin', 'ecosprin'].includes(d));
const NSAID_RE = termRegex([...NSAIDS_PREGNANCY, 'ब्रुफेन', 'आइबुप्रोफेन', 'कॉम्बिफ्लेम']);
const ACE_ARB_RE = /(?<![\p{L}])(?:\p{L}{3,}pril|\p{L}{3,}sartan)(?![\p{L}])/iu;

const WARNING_SIGNS: { key: 'headache' | 'vision' | 'swelling' | 'abdominal' | 'movement'; re: RegExp }[] = [
  { key: 'headache', re: termRegex(['headache', 'head ache', 'head pain', 'head is paining', 'migraine', 'sir dard', 'sar dard', 'sir me dard', 'sar me dard', 'सिर दर्द', 'सिरदर्द', 'सर दर्द', 'सिर में दर्द']) },
  { key: 'vision', re: termRegex(['blurred', 'blurry', 'blur', 'blurring', 'vision problem', 'problem with my vision', 'double vision', 'cannot see clearly', "can't see clearly", 'seeing spots', 'flashing lights', 'spots in front of my eyes', 'dhundhla', 'dhundla', 'धुंधला', 'धुंधली', 'आंखों के आगे']) },
  { key: 'swelling', re: termRegex(['swelling', 'swollen', 'puffy', 'puffiness', 'sujan', 'soojan', 'सूजन']) },
  { key: 'abdominal', re: termRegex(['upper abdominal pain', 'upper stomach pain', 'upper belly pain', 'pain under my ribs', 'pain below my ribs', 'pain under the ribs', 'epigastric', 'pain in upper stomach', 'pain in upper abdomen', 'pet ke upar dard', 'पेट के ऊपर दर्द']) },
  { key: 'movement', re: termRegex(['baby moving less', 'baby is moving less', 'baby not moving much', 'baby is not moving much', 'less movement', 'fewer kicks', 'less kicks', 'reduced movement', 'reduced fetal movement', 'baby kicks less', 'bachcha kam hil', 'बच्चा कम हिल']) },
];

const SALTY_FOOD_RE = termRegex(['pickle', 'achar', 'achaar', 'papad', 'papadum', 'namkeen', 'chips', 'salt', 'namak', 'salty', 'noodles', 'maggi', 'ketchup', 'sauce', 'dry fish', 'dried fish', 'salted', 'bhujia', 'chakli', 'अचार', 'पापड़', 'नमकीन', 'नमक']);

const DOSE_CHANGE_RE = termRegex(['stop', 'stopping', 'skip', 'quit', 'double', 'extra dose', 'extra tablet', 'two tablets', 'more tablets', 'reduce', 'increase', 'half tablet', 'cut the tablet', 'leave the medicine', 'band kar', 'band karna', 'chhod', 'chod do', 'बंद', 'छोड़']);
const MEDICINE_WORD_RE = termRegex(['medicine', 'tablet', 'pill', 'dose', 'goli', 'dawa', 'dawai', 'दवा', 'दवाई', 'गोली']);

// ------------------------------------------------------------------- rules

const firstWord = (name: string) => name.split(/[\s+(]/)[0].toLowerCase();

/** The drug families an allergy entry belongs to ("Penicillin" → penicillin; "Amoxicillin" → penicillin). */
function allergyFamilies(allergy: string): string[] {
  const a = allergy.toLowerCase();
  return Object.entries(DRUG_FAMILIES)
    .filter(([fam, members]) => a.includes(fam) || members.some((m) => a.includes(m)))
    .map(([fam]) => fam);
}

function allergyMatch(text: string, ctx: PatientContext): PersonalWarning | null {
  for (const allergy of ctx.allergies) {
    // The allergy itself ("peanut", "penicillin"), then its drug family members.
    const own = allergy.toLowerCase().replace(/\b(?:allergy|allergic|to)\b/g, '').trim();
    const singular = own.length > 4 ? own.replace(/(?:es|s)$/, '') : own;
    const terms = [own, singular, ...allergyFamilies(allergy).flatMap((f) => DRUG_FAMILIES[f])].filter((x) => x.length >= 3);
    const hit = findTerm(text, termRegex(terms));
    if (hit) {
      return {
        code: 'allergy_match',
        params: { allergy, item: hit },
        text: `Your record shows an allergy to ${allergy}. ${hit} ${own && hit.toLowerCase().startsWith(own) ? '' : 'is in the same medicine family and '}can cause a serious reaction. Do not take or eat it unless your doctor has checked your allergy. Tell every doctor and pharmacist about this allergy.`,
        escalate: false,
        uses: ['allergies'],
      };
    }
  }
  return null;
}

/** Pregnant at 20 weeks or more. */
const lateOrUnknownPregnancy = (ctx: PatientContext) => !!ctx.pregnancy && ctx.pregnancy.weeks >= 20;

function nsaidPregnancy(text: string, ctx: PatientContext): PersonalWarning | null {
  if (!lateOrUnknownPregnancy(ctx)) return null;
  const hit = findTerm(text, NSAID_RE);
  if (!hit) return null;
  return {
    code: 'nsaid_pregnancy',
    params: { weeks: ctx.pregnancy!.weeks, item: hit },
    text: `Your record shows you are about ${ctx.pregnancy!.weeks} weeks pregnant. Painkillers like ${hit} (NSAIDs) are usually avoided after 20 weeks of pregnancy because they can harm the baby. Do not take it unless your doctor says so. Ask your doctor or the PHC what is safe for your pain.`,
    escalate: false,
    uses: ['pregnancy'],
  };
}

function aceArbPregnancy(text: string, ctx: PatientContext): PersonalWarning | null {
  if (!ctx.pregnancy) return null;
  const hit = findTerm(text, ACE_ARB_RE);
  if (!hit) return null;
  return {
    code: 'ace_arb_pregnancy',
    params: { weeks: ctx.pregnancy.weeks, item: hit },
    text: `Your record shows you are pregnant. Blood pressure medicines like ${hit} (ACE inhibitors and ARBs) are not used in pregnancy because they can harm the baby. Do not start it, and do not change your BP medicine without your doctor.`,
    escalate: false,
    uses: ['pregnancy', 'medicines'],
  };
}

function pregnancyWarningSign(text: string, ctx: PatientContext): PersonalWarning | null {
  if (!ctx.pregnancy) return null;
  const htn = hasHypertension(ctx);
  const signs = WARNING_SIGNS.filter((s) => (htn || s.key === 'vision' || s.key === 'abdominal' || s.key === 'movement') && findTerm(text, s.re)).map((s) => s.key);
  if (!signs.length) return null;
  const weeks = ctx.pregnancy.weeks;
  return htn
    ? {
        code: 'preg_htn_warning_sign',
        params: { weeks, signs: signs.join(',') },
        text: `Your record shows you are about ${weeks} weeks pregnant with high blood pressure. Headache, blurred vision, swelling, pain in the upper stomach or less baby movement can be warning signs of pre-eclampsia. Go to the hospital now or call 108. Do not wait.`,
        escalate: true,
        uses: ['pregnancy', 'conditions'],
      }
    : {
        code: 'preg_danger_sign',
        params: { weeks, signs: signs.join(',') },
        text: `Your record shows you are about ${weeks} weeks pregnant. Blurred vision, pain in the upper stomach or less baby movement are danger signs in pregnancy. Go to the hospital now or call 108.`,
        escalate: true,
        uses: ['pregnancy'],
      };
}

function highSaltBp(text: string, ctx: PatientContext): PersonalWarning | null {
  if (!hasHypertension(ctx)) return null;
  const hit = findTerm(text, SALTY_FOOD_RE);
  if (!hit) return null;
  return {
    code: 'high_salt_bp',
    params: { item: hit },
    text: `Your record shows high blood pressure. ${hit[0].toUpperCase()}${hit.slice(1)} and other salty foods like papad and namkeen raise BP. Avoid them or keep them very small, and follow your doctor's diet advice.`,
    escalate: false,
    uses: ['conditions', 'vitals'],
  };
}

function doseChange(text: string, ctx: PatientContext): PersonalWarning | null {
  if (!ctx.activeMedicines.length || !findTerm(text, DOSE_CHANGE_RE)) return null;
  const named = ctx.activeMedicines.find((m) => firstWord(m.name).length >= 4 && text.toLowerCase().includes(firstWord(m.name)));
  if (!named && !findTerm(text, MEDICINE_WORD_RE)) return null;
  const item = named?.name ?? '';
  return {
    code: 'dose_change',
    params: { item },
    text: `Do not stop, skip or change ${item ? `your ${item}` : 'your medicines'} on your own. Ask your doctor before changing any medicine.`,
    escalate: false,
    uses: ['medicines'],
  };
}

const RULES = [pregnancyWarningSign, allergyMatch, nsaidPregnancy, aceArbPregnancy, highSaltBp, doseChange];

/**
 * All rules over the message (and its English translation, when given).
 * Escalating warnings come first. Without a context, nothing fires.
 */
export function checkPersonalSafety(texts: string[], ctx: PatientContext | null): PersonalWarning[] {
  if (!ctx) return [];
  const text = [...new Set(texts.map((t) => t.normalize('NFC').trim()).filter(Boolean))].join(' . ');
  if (!text) return [];
  const out = RULES.map((r) => r(text, ctx)).filter((w): w is PersonalWarning => !!w);
  return [...out.filter((w) => w.escalate), ...out.filter((w) => !w.escalate)];
}
