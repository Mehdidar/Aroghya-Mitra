/**
 * Guided symptom check for the patient chat.
 *
 * When a patient mentions cough, fever or diarrhoea, the assistant asks a few
 * short questions (one per turn, with tap-to-answer chips), then names the
 * POSSIBLE causes that match the answers and says what to do. The questions,
 * the danger signs and the possible causes are fixed rules here, not AI
 * guesses, so a clinician can review them (`npm run review:clinical`) and the
 * same answers always give the same result. The AI only phrases the question
 * or the result in the patient's language.
 *
 * Stateless: the whole check is re-derived from the user's turns in the chat
 * history every time, so neither the app nor the server keeps any state.
 *
 * STATUS: reviewed: false. A screening aid, never a diagnosis.
 */
import type { RedFlagCategory } from '../safety/redFlagTerms.ts';

export type SymptomId = 'cough' | 'fever' | 'diarrhoea';

/** A question's stored answer: yes/no, a duration in days, or 'unknown' when the reply did not answer it. */
type Answer = boolean | number | 'unknown';
export type CheckState = Record<string, Answer>;

export interface TriageQuestion {
  id: string;
  text: string;
  kind: 'yesno' | 'duration';
  /** Tap-to-answer chips, in English (translated by the chat service). */
  options: string[];
  /** For duration questions: the number of days each option stands for. */
  optionDays?: number[];
  /** Ask only when this holds (on answers so far). */
  askIf?: (s: CheckState) => boolean;
  /** `askIf` in plain words, for the clinical review sheet. */
  askWhen?: string;
  /** A "yes" here is an emergency: stop the check and show the 108 banner. */
  emergencyIfYes?: { category: RedFlagCategory; steps: string[] };
  /** Phrases that already answer the question when the patient says them unprompted (English or Hindi/Hinglish). */
  mentions?: RegExp;
}

export interface Possibility {
  name: string;
  likelihood: 'more likely' | 'possible';
  /** The answers that point to it, in plain words. */
  because: string[];
  /** Knowledge-base document with more on it, if there is one. */
  docId?: string;
}

export interface CheckResult {
  possibilities: Possibility[];
  /** What to do now, most important first. */
  actions: string[];
  urgency: 'home care' | 'see a doctor in 1 to 2 days' | 'see a doctor today';
  seeDoctorIf: string[];
}

export interface SymptomRule {
  id: SymptomId;
  label: string;
  /** Knowledge-base documents whose match starts this check. */
  triggerDocs: string[];
  questions: TriageQuestion[];
  decide(s: CheckState): CheckResult;
  /** The decision rules in plain words, for the clinical review sheet. */
  reviewSummary: string[];
}

const YES = ['Yes', 'No'];
const days = (s: CheckState, id = 'duration'): number | null => (typeof s[id] === 'number' ? (s[id] as number) : null);
const yes = (s: CheckState, id: string) => s[id] === true;

const CALL_108 = 'Call 108 now, or go to the nearest hospital.';

// ---------------------------------------------------------------- cough
const cough: SymptomRule = {
  id: 'cough',
  label: 'Cough or cold',
  triggerDocs: ['cough-cold', 'tuberculosis'],
  questions: [
    {
      id: 'duration',
      text: 'How long have you had the cough or cold?',
      kind: 'duration',
      options: ['Less than 1 week', '1 to 2 weeks', 'More than 2 weeks'],
      optionDays: [3, 10, 21],
    },
    {
      id: 'breathing',
      text: 'Are you short of breath, or breathing very fast?',
      kind: 'yesno',
      options: YES,
      emergencyIfYes: { category: 'breathing', steps: [CALL_108, 'Sit upright and stay calm.', 'If you have an inhaler from your doctor, use it.'] },
      mentions: /breathless|short of breath|difficulty breathing|trouble breathing|saans (?:phool|lene)|सांस (?:फूल|लेने)/,
    },
    {
      id: 'blood',
      text: 'If you cough, is there any blood?',
      kind: 'yesno',
      options: YES,
      emergencyIfYes: { category: 'bleeding', steps: [CALL_108, 'Sit upright and keep calm.'] },
      mentions: /blood|khoon|खून/,
    },
    { id: 'fever', text: 'Do you have fever?', kind: 'yesno', options: YES, mentions: /fever|bukhar|बुखार|temperature/ },
    {
      id: 'tb_signs',
      text: 'Any night sweats, or weight loss without trying?',
      kind: 'yesno',
      options: YES,
      askIf: (s) => (days(s) ?? 0) >= 7,
      askWhen: 'cough for 1 week or more',
      mentions: /night sweat|sweating at night|weight loss|losing weight|lost weight|raat ko pasina|रात को पसीना|वजन (?:कम|घट)/,
    },
    {
      id: 'cold_signs',
      text: 'Do you also have a runny nose, sneezing or a sore throat?',
      kind: 'yesno',
      options: YES,
      askIf: (s) => (days(s) ?? 0) < 14,
      askWhen: 'cough for less than 2 weeks',
      mentions: /runny nose|blocked nose|sneez|sore throat|throat|zukam|jukam|naak|जुकाम|गला|नाक|\b(?:a|have|got|caught|with) cold\b|common cold|sardi|सर्दी/,
    },
    {
      id: 'wheeze',
      text: 'Does your breath whistle, or do dust, smoke or cold air make the cough worse?',
      kind: 'yesno',
      options: YES,
      askIf: (s) => (days(s) ?? 0) >= 7 || s.cold_signs === false,
      askWhen: 'cough for 1 week or more, or no cold signs',
      mentions: /wheez|whistl|dust|smoke|allerg|dhool|dhuan|धूल|धुआं/,
    },
  ],
  decide(s) {
    const d = days(s);
    const p: Possibility[] = [];
    const actions: string[] = [];
    let urgency: CheckResult['urgency'] = 'home care';

    if ((d !== null && d > 14) || yes(s, 'tb_signs')) {
      const because = [d !== null && d > 14 ? 'cough for more than 2 weeks' : '', yes(s, 'tb_signs') ? 'night sweats or weight loss' : '', yes(s, 'fever') ? 'fever' : ''].filter(Boolean);
      p.push({ name: 'Tuberculosis (TB)', likelihood: yes(s, 'tb_signs') || yes(s, 'fever') ? 'more likely' : 'possible', because, docId: 'tuberculosis' });
      if (yes(s, 'wheeze') || !yes(s, 'tb_signs')) p.push({ name: 'Asthma, allergy, or a cough from smoke or dust', likelihood: 'possible', because: yes(s, 'wheeze') ? ['whistling breath or cough with dust or smoke'] : ['long cough without other TB signs'] });
      actions.push('Get a free TB test (sputum test) at a government health centre this week.');
      urgency = 'see a doctor in 1 to 2 days';
    } else if (yes(s, 'fever') && d !== null && d >= 7) {
      p.push({ name: 'Chest infection (bronchitis or pneumonia)', likelihood: 'possible', because: ['cough for 1 to 2 weeks', 'fever'] });
      actions.push('See a doctor in the next 1 to 2 days to have your chest checked.');
      urgency = 'see a doctor in 1 to 2 days';
    } else {
      if (yes(s, 'cold_signs')) p.push({ name: 'Common cold (a virus)', likelihood: 'more likely', because: ['short cough', 'runny nose, sneezing or sore throat'], docId: 'cough-cold' });
      if (yes(s, 'fever')) p.push({ name: 'Flu or another viral infection', likelihood: yes(s, 'cold_signs') ? 'possible' : 'more likely', because: ['short cough', 'fever'], docId: 'cough-cold' });
      if (yes(s, 'wheeze')) p.push({ name: 'Asthma or allergy', likelihood: 'possible', because: ['whistling breath or cough with dust, smoke or cold air'] });
      if (p.length === 0) p.push({ name: 'A mild viral infection, or throat irritation from dust or smoke', likelihood: 'more likely', because: ['short cough with no other signs'], docId: 'cough-cold' });
      actions.push('Rest, drink warm fluids, gargle with warm salt water, and use steam for a blocked nose.');
    }
    if (yes(s, 'wheeze') && !actions.some((a) => a.includes('doctor'))) actions.push('If the whistling breath keeps coming back, see a doctor about asthma.');
    return {
      possibilities: p,
      actions,
      urgency,
      seeDoctorIf: ['the cough lasts more than 2 weeks', 'fever lasts more than 3 days', 'breathing becomes difficult or you cough up blood (call 108)'],
    };
  },
  reviewSummary: [
    'Difficulty or fast breathing, or blood in the cough: stop the check, show the 108 emergency banner.',
    'Cough > 2 weeks, or night sweats / weight loss: possible TB (more likely with fever or those signs); also asthma/allergy/smoke cough; free sputum test this week.',
    'Cough 1-2 weeks with fever: possible chest infection (bronchitis or pneumonia); doctor in 1-2 days.',
    'Shorter cough: common cold (with runny nose/sore throat), flu or other viral infection (with fever), asthma/allergy (with wheeze), else mild viral infection or irritation; home care.',
  ],
};

// ---------------------------------------------------------------- fever
const fever: SymptomRule = {
  id: 'fever',
  label: 'Fever',
  triggerDocs: ['fever-care', 'dengue'],
  questions: [
    { id: 'duration', text: 'How many days have you had the fever?', kind: 'duration', options: ['1 to 2 days', '3 to 7 days', 'More than a week'], optionDays: [2, 5, 10] },
    {
      id: 'danger',
      text: 'Is there any of these: difficulty breathing, confusion or a fit, very stiff neck, bleeding from gums or nose, severe stomach pain, or vomiting again and again?',
      kind: 'yesno',
      options: YES,
      emergencyIfYes: { category: 'unconscious', steps: [CALL_108, 'Keep the person lying on their side if they are very drowsy.', 'Do not give anything by mouth if they are confused or having a fit.'] },
      mentions: /confus|fits?\b|seizure|convuls|stiff neck|bleeding|severe stomach pain|vomiting again|behosh|बेहोश|दौरा/,
    },
    { id: 'chills', text: 'Does the fever come with shivering or chills, and then sweating?', kind: 'yesno', options: YES, mentions: /chill|shiver|kaanp|kanp|thand lag|ठंड लग|कंपकंपी/ },
    { id: 'aches', text: 'Is there severe body or joint pain, or pain behind the eyes?', kind: 'yesno', options: YES, mentions: /body pain|body ache|joint pain|behind the eyes|badan dard|jodon|बदन दर्द|जोड़ों/ },
    { id: 'urine', text: 'Is there burning or pain when you pass urine?', kind: 'yesno', options: YES, mentions: /burning (?:urine|while|when)|pain (?:while|when) (?:passing )?urin|peshab me jalan|पेशाब में जलन/ },
    { id: 'cold_signs', text: 'Do you have a cough, runny nose or sore throat?', kind: 'yesno', options: YES, mentions: /cough|runny nose|sore throat|khansi|zukam|खांसी|जुकाम|गला|\b(?:a|have|got|caught|with) cold\b|common cold|sardi|सर्दी/ },
  ],
  decide(s) {
    const d = days(s);
    const p: Possibility[] = [];
    const actions: string[] = [];
    let urgency: CheckResult['urgency'] = 'home care';
    if (yes(s, 'chills')) {
      p.push({ name: 'Malaria', likelihood: 'possible', because: ['fever with shivering, then sweating'] });
      actions.push('Get a malaria blood test today at a government health centre (it is free).');
      urgency = 'see a doctor today';
    }
    if (yes(s, 'aches')) {
      p.push({ name: 'Dengue or chikungunya', likelihood: 'possible', because: ['fever with severe body or joint pain, or pain behind the eyes'], docId: 'dengue' });
      actions.push('Get a blood test today. Drink plenty of fluids. Do not take ibuprofen or aspirin.');
      urgency = 'see a doctor today';
    }
    if (yes(s, 'urine')) {
      p.push({ name: 'Urine infection', likelihood: 'possible', because: ['fever with burning when passing urine'] });
      actions.push('See a doctor for a urine test.');
      if (urgency === 'home care') urgency = 'see a doctor in 1 to 2 days';
    }
    if (yes(s, 'cold_signs')) p.push({ name: 'Flu, cold or another viral infection', likelihood: p.length ? 'possible' : 'more likely', because: ['fever with cough, runny nose or sore throat'], docId: 'fever-care' });
    if (d !== null && d > 7 && p.length === 0) {
      p.push({ name: 'Typhoid or another infection that needs tests', likelihood: 'possible', because: ['fever for more than a week'] });
      actions.push('See a doctor for blood tests.');
      urgency = 'see a doctor today';
    }
    if (p.length === 0) p.push({ name: 'A common viral fever', likelihood: 'more likely', because: ['fever with no other signs'], docId: 'fever-care' });
    if (d !== null && d >= 3 && urgency === 'home care') {
      actions.push('Fever for 3 days or more: see a doctor.');
      urgency = 'see a doctor in 1 to 2 days';
    }
    actions.push('Rest and drink plenty of fluids. Sponge with normal (not cold) water if the fever is high.');
    return { possibilities: p, actions, urgency, seeDoctorIf: ['fever lasts 3 days or more', 'any danger sign appears (call 108)'] };
  },
  reviewSummary: [
    'Breathing difficulty, confusion/fit, stiff neck, bleeding, severe stomach pain or repeated vomiting: stop, show the 108 banner.',
    'Chills then sweating: possible malaria; blood test today. Severe body/joint pain or pain behind the eyes: possible dengue/chikungunya; blood test today, fluids, no ibuprofen/aspirin.',
    'Burning urine: possible urine infection; doctor. Cough/cold signs: flu or viral infection.',
    'More than a week with none of these: possible typhoid or other infection; doctor for tests. Otherwise a common viral fever; see a doctor if it lasts 3 days or more.',
  ],
};

// ---------------------------------------------------------------- diarrhoea
const diarrhoea: SymptomRule = {
  id: 'diarrhoea',
  label: 'Diarrhoea',
  triggerDocs: ['diarrhoea-ors'],
  questions: [
    { id: 'duration', text: 'How long have you had loose motions?', kind: 'duration', options: ['Less than 2 days', '2 days to 2 weeks', 'More than 2 weeks'], optionDays: [1, 5, 20] },
    {
      id: 'dehydration',
      text: 'Are there signs of water loss: very little urine, very dry mouth, dizziness, or not able to drink?',
      kind: 'yesno',
      options: YES,
      emergencyIfYes: { category: 'unconscious', steps: [CALL_108, 'Keep giving small sips of ORS on the way, if the person can swallow.'] },
      mentions: /dizz|very dry mouth|no urine|little urine|can(?:'|no)t drink|chakkar|चक्कर/,
    },
    { id: 'blood', text: 'Is there any blood in the stool?', kind: 'yesno', options: YES, mentions: /blood|khoon|खून/ },
    { id: 'vomiting', text: 'Are you vomiting again and again?', kind: 'yesno', options: YES, mentions: /vomit|ulti|उल्टी/ },
    { id: 'fever', text: 'Do you have fever?', kind: 'yesno', options: YES, mentions: /fever|bukhar|बुखार/ },
  ],
  decide(s) {
    const d = days(s);
    const p: Possibility[] = [];
    const actions = ['Drink ORS after every loose stool and keep eating light food.'];
    let urgency: CheckResult['urgency'] = 'home care';
    if (yes(s, 'blood')) {
      p.push({ name: 'Dysentery (a bacterial stomach infection)', likelihood: 'possible', because: ['blood in the stool'], docId: 'diarrhoea-ors' });
      actions.unshift('See a doctor today.');
      urgency = 'see a doctor today';
    }
    if (d !== null && d > 14) {
      p.push({ name: 'Long-lasting diarrhoea (an infection, worms or another cause)', likelihood: 'possible', because: ['loose motions for more than 2 weeks'] });
      if (urgency === 'home care') urgency = 'see a doctor in 1 to 2 days';
      actions.unshift('See a doctor for stool tests.');
    }
    if (p.length === 0) {
      p.push({ name: 'Stomach infection or food poisoning', likelihood: 'more likely', because: [yes(s, 'vomiting') ? 'loose motions with vomiting' : 'loose motions', ...(yes(s, 'fever') ? ['fever'] : [])], docId: 'diarrhoea-ors' });
      if (yes(s, 'vomiting')) {
        actions.unshift('If you cannot keep fluids down, see a doctor today.');
        urgency = 'see a doctor today';
      } else if (yes(s, 'fever') || (d !== null && d >= 2)) urgency = 'see a doctor in 1 to 2 days';
    }
    return { possibilities: p, actions, urgency, seeDoctorIf: ['it lasts more than 2 days', 'there is blood in the stool or fever', 'signs of water loss appear (go to hospital)'] };
  },
  reviewSummary: [
    'Signs of water loss (little urine, very dry mouth, dizziness, cannot drink): stop, show the 108 banner.',
    'Blood in stool: possible dysentery; doctor today. More than 2 weeks: long-lasting diarrhoea; doctor for stool tests.',
    'Otherwise stomach infection or food poisoning; ORS; doctor today if vomiting keeps fluids from staying down, in 1-2 days with fever or after 2 days.',
  ],
};

export const SYMPTOM_RULES: Record<SymptomId, SymptomRule> = { cough, fever, diarrhoea };

/** Which check a knowledge-base match starts, if any. */
export function symptomForDoc(docId: string | undefined): SymptomId | null {
  if (!docId) return null;
  for (const r of Object.values(SYMPTOM_RULES)) if (r.triggerDocs.includes(docId)) return r.id;
  return null;
}

// ---------------------------------------------------------------- reading answers

const NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, few: 3, several: 4,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5,
};
const UNIT_DAYS: [RegExp, number][] = [
  [/^(?:days?|din|dino|dinon|दिन|दिनों)$/, 1],
  [/^(?:weeks?|hafta|hafte|haftey|हफ्ता|हफ्ते|हफ़्ते|हफ़्ता|सप्ताह)$/, 7],
  [/^(?:months?|mahina|mahine|महीना|महीने)$/, 30],
];

/** Days from "3 weeks", "do hafte se", "since yesterday", or a chip label. */
export function parseDuration(text: string, q?: TriageQuestion): number | null {
  const t = text.toLowerCase().normalize('NFC');
  if (q?.optionDays) {
    const i = q.options.findIndex((o) => t.includes(o.toLowerCase()));
    if (i >= 0) return q.optionDays[i];
  }
  const words = t.split(/[^\p{L}\p{M}\p{N}.]+/u).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const n = /^\d/.test(words[i]) ? parseFloat(words[i]) : NUM[words[i]];
    if (n === undefined || Number.isNaN(n)) continue;
    const unit = UNIT_DAYS.find(([re]) => re.test(words[i + 1]));
    if (unit) return n * unit[1];
  }
  // A unit with no number: "a week", "for weeks", "for months".
  if (/\bmonths\b|kai mahine|कई महीन/.test(t)) return 60;
  if (/\bweeks\b|kai hafte|कई हफ्/.test(t)) return 21;
  if (/\b(?:a|one) week\b|ek hafta|एक हफ्त/.test(t)) return 7;
  if (/yesterday|kal se|कल से|since morning|today|aaj se|आज/.test(t)) return 1;
  return null;
}

const END = '(?=$|[^\\p{L}\\p{M}])';
const YES_RE = new RegExp(`^(?:yes|yeah|yep|yup|ya|haan|han|haa|ha|ji|correct|right|हाँ|हां|हा|जी|جی|ہاں)${END}`, 'u');
const NO_RE = new RegExp(`^(?:no|nope|nah|not really|nahi|nahin|nai|na|नहीं|नही|ना|نہیں|نا)${END}`, 'u');
// Hindi puts the "no" after the word ("बुखार नहीं है"); English before it ("no fever"). Neither crosses a comma.
const NEG_AFTER = new RegExp(`^\\s*(?:[\\p{L}\\p{M}]+\\s+){0,2}?(?:nahi|nahin|नहीं|नही)${END}`, 'u');
const NEG_BEFORE = /(?:\bno|\bnot|\bwithout|\bnever|\bnahi)\s+(?:[\p{L}\p{M}]+\s+){0,2}$/u;

export function parseYesNo(text: string): boolean | null {
  const t = text.toLowerCase().normalize('NFC').trim().replace(/^[^\p{L}\p{N}]+/u, '');
  if (NO_RE.test(t)) return false;
  if (YES_RE.test(t)) return true;
  return null;
}

/** true / false when the text mentions the sign (with or without a "no"), null when it does not mention it. */
function mentioned(text: string, re: RegExp): boolean | null {
  const t = text.toLowerCase().normalize('NFC');
  const m = re.exec(t);
  if (!m) return null;
  const before = t.slice(Math.max(0, m.index - 30), m.index);
  const after = t.slice(m.index + m[0].length, m.index + m[0].length + 25);
  return !(NEG_BEFORE.test(before) || NEG_AFTER.test(after));
}

// ---------------------------------------------------------------- running a check

export type CheckOutcome =
  | { kind: 'ask'; symptom: SymptomId; question: TriageQuestion; asked: number }
  | { kind: 'emergency'; symptom: SymptomId; category: RedFlagCategory; steps: string[]; questionId: string }
  | { kind: 'result'; symptom: SymptomId; result: CheckResult; state: CheckState };

const MAX_QUESTIONS = 6;

function nextQuestion(rule: SymptomRule, s: CheckState): TriageQuestion | null {
  return rule.questions.find((q) => s[q.id] === undefined && (!q.askIf || q.askIf(s))) ?? null;
}

function absorbMentions(rule: SymptomRule, s: CheckState, text: string): void {
  for (const q of rule.questions) {
    if (s[q.id] !== undefined) continue;
    if (q.kind === 'duration') {
      const d = parseDuration(text);
      if (d !== null) s[q.id] = d;
    } else if (q.mentions) {
      const v = mentioned(text, q.mentions);
      if (v !== null) s[q.id] = v;
    }
  }
}

/**
 * Run one check over the user's turns, starting at the turn that named the symptom.
 * `turns` are in English or Hindi/Hinglish (translate other languages first).
 */
export function runCheck(symptom: SymptomId, turns: string[]): CheckOutcome {
  const rule = SYMPTOM_RULES[symptom];
  const s: CheckState = {};
  let pending: TriageQuestion | null = null;
  let asked = 0;
  for (const text of turns) {
    if (pending && s[pending.id] === undefined) {
      const v = pending.kind === 'duration' ? parseDuration(text, pending) : parseYesNo(text);
      s[pending.id] = v ?? 'unknown';
    }
    absorbMentions(rule, s, text);
    for (const q of rule.questions) {
      if (q.emergencyIfYes && s[q.id] === true) return { kind: 'emergency', symptom, category: q.emergencyIfYes.category, steps: q.emergencyIfYes.steps, questionId: q.id };
    }
    pending = asked < MAX_QUESTIONS ? nextQuestion(rule, s) : null;
    if (!pending) return { kind: 'result', symptom, result: rule.decide(s), state: s };
    asked++;
  }
  return { kind: 'ask', symptom, question: pending!, asked };
}

/** Text for the chat system prompt: what the assistant must say this turn. */
export function describeForPrompt(o: CheckOutcome): string {
  if (o.kind === 'ask') {
    return `SYMPTOM CHECK in progress (${SYMPTOM_RULES[o.symptom].label}, question ${o.asked}).
Do not list possible causes yet. In one short, kind sentence acknowledge what the user said, then ask exactly this one question, in the reply language, and nothing more:
"${o.question.text}"`;
  }
  if (o.kind === 'emergency') return '';
  const r = o.result;
  const lines = r.possibilities.map((p, i) => `${i + 1}. ${p.name} (${p.likelihood}), because: ${p.because.join(', ')}`);
  return `SYMPTOM CHECK RESULT (${SYMPTOM_RULES[o.symptom].label}). These come from the app's reviewed rules; do not add or remove causes.
Possible causes, most likely first:
${lines.join('\n')}
Urgency: ${r.urgency}.
What to do: ${r.actions.join(' ')}
See a doctor if: ${r.seeDoctorIf.join('; ')}.
Tell the user, in simple words: what these symptoms can be caused by (use "this can happen with" or "it could be", never "you have"), what to do now, and when to see a doctor. Say clearly that this is not a diagnosis and only a doctor or a test can confirm it.`;
}
