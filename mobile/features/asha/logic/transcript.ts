import type { Symptom, Vitals } from '../types';

/**
 * Turns a spoken visit report (English, Hindi or Hinglish, as returned by Sarvam STT)
 * into structured vitals and symptom codes. Everything it extracts is shown to the
 * ASHA for confirmation before saving; it never saves on its own.
 */

export type ParsedVitals = Omit<Vitals, 'recordedAt'>;

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15,
};

export function normalize(text: string): string {
  let s = text.toLowerCase();
  s = s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  // "7 point 5" / "7 दशमलव 5" -> 7.5
  s = s.replace(/(\d+)\s*(?:point|दशमलव|पॉइंट|प्वाइंट)\s*(\d+)/g, '$1.$2');
  // Small number words (used for Hb, weeks, days) -> digits
  s = s.replace(/[\p{L}\p{M}]+/gu, (w) => (w in NUMBER_WORDS ? String(NUMBER_WORDS[w]) : w));
  return s.replace(/\s+/g, ' ');
}

const NUM = '(\\d{1,3}(?:\\.\\d)?)';
// Up to ~20 non-digit characters between a keyword and its number ("BP is around 150"),
// never crossing a clause boundary, so "no fever, pulse 100" does not read 100 as a temperature.
const GAP = '[^\\d\\n.,;।]{0,20}?';

function firstNumber(s: string, keywords: string[]): number | undefined {
  for (const k of keywords) {
    const m = new RegExp(`${k}${GAP}${NUM}`, 'u').exec(s);
    if (m) return parseFloat(m[1]);
  }
  return undefined;
}

const BP_KEYS = ['bp', 'b\\.p\\.?', 'blood pressure', 'बीपी', 'बी\\.पी\\.?', 'रक्तचाप', 'ब्लड प्रेशर'];
const SEP = '\\s*(?:/|by|over|बटा|बाय|ओवर|और|-)\\s*';

function parseBP(s: string): { systolic?: number; diastolic?: number } {
  for (const k of BP_KEYS) {
    const m = new RegExp(`${k}${GAP}(\\d{2,3})${SEP}(\\d{2,3})`, 'u').exec(s);
    if (m) return { systolic: +m[1], diastolic: +m[2] };
  }
  // Bare "150/100" without a keyword
  const bare = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(s);
  if (bare && +bare[1] >= 70 && +bare[1] <= 260 && +bare[2] >= 40 && +bare[2] <= 160) {
    return { systolic: +bare[1], diastolic: +bare[2] };
  }
  return {};
}

interface SymptomPattern {
  code: Symptom;
  patterns: RegExp[];
}

const SYMPTOMS: SymptomPattern[] = [
  { code: 'hemoptysis', patterns: [/blood in (?:the )?(?:sputum|cough|phlegm)|coughing (?:up )?blood|hemoptysis|haemoptysis/, /बलगम में खून|खांसी में खून|खून की उल्टी|खाँसी में खून/] },
  { code: 'bleeding_pv', patterns: [/bleeding|spotting/, /खून (?:आ|जा|बह)|रक्तस्राव|ब्लीडिंग/] },
  { code: 'severe_headache', patterns: [/headache|head ache|head pain/, /सिर ?दर्द|सर ?दर्द|सिर में दर्द|सर में दर्द/] },
  { code: 'blurred_vision', patterns: [/blur(?:red|ry)? vision|blurring|can'?t see clearly|vision problem/, /धुंधला|धुँधला|कम दिख/] },
  { code: 'convulsions', patterns: [/convuls|\bfits?\b|seizure/, /दौरा|दौरे|झटके|मिर्गी/] },
  { code: 'swelling_face_hands', patterns: [/swelling|swollen|oedema|edema/, /सूजन/] },
  { code: 'fever', patterns: [/fever|feverish/, /बुखार|ज्वर|ताप है/] },
  { code: 'leaking_fluid', patterns: [/leaking|water (?:broke|break)|fluid (?:coming|leak)/, /पानी (?:आ|गिर|निकल)/] },
  { code: 'severe_abdominal_pain', patterns: [/(?:abdominal|stomach|belly|tummy) pain|pain in (?:the )?(?:abdomen|stomach)/, /पेट (?:में )?दर्द/] },
  { code: 'breathlessness', patterns: [/breathless|short(?:ness)? of breath|difficulty (?:in )?breathing|can'?t breathe/, /सांस (?:फूल|लेने में|नहीं)|साँस (?:फूल|लेने में)|सांस की तकलीफ/] },
  { code: 'not_feeding', patterns: [/not (?:feeding|breastfeeding|sucking|drinking milk)|unable to feed|poor feeding/, /दूध नहीं पी|स्तनपान नहीं|दूध नहीं ले/] },
  { code: 'lethargy', patterns: [/letharg|unconscious|drowsy|not active|floppy/, /सुस्त|बेहोश|ढीला/] },
  { code: 'jaundice', patterns: [/jaundice|yellow (?:skin|eyes)/, /पीलिया|पीला/] },
  { code: 'umbilical_redness', patterns: [/umbilic|navel|cord (?:red|pus|infect)/, /नाभि/] },
  { code: 'chest_indrawing', patterns: [/chest indrawing|indrawing|ribs? (?:pulling|going in)/, /पसली चल|छाती धंस/] },
  { code: 'cold_to_touch', patterns: [/cold to touch|baby (?:is )?cold|feels cold|hypotherm/, /ठंडा|ठंडी/] },
  { code: 'cough_2_weeks', patterns: [/cough (?:for |since )?(?:more than |over )?(?:2|3|4|two|three|four) weeks|(?:2|two|3|three) weeks? (?:of )?cough|chronic cough|long cough/, /(?:2|3|4|दो|तीन) (?:हफ्ते|हफ़्ते|सप्ताह)(?: से)? (?:की )?खांसी|खांसी (?:2|3|दो|तीन) (?:हफ्ते|हफ़्ते|सप्ताह)|पुरानी खांसी|लंबी खांसी/] },
  { code: 'weight_loss', patterns: [/weight loss|losing weight|lost weight/, /वजन (?:कम|घट)|वज़न (?:कम|घट)/] },
  { code: 'night_sweats', patterns: [/night sweat|sweating at night/, /रात (?:को|में) पसीना/] },
  { code: 'chest_pain', patterns: [/chest pain|pain in (?:the )?chest/, /सीने में दर्द|छाती में दर्द|सीना दर्द/] },
];

const NEGATION_BEFORE = /\b(?:no|not|denies|without|nil|absent)\s+(?:\w+\s+){0,2}$/;
const NEGATION_AFTER = /^\s*(?:\S+\s*){0,3}?(?:नहीं|ना है|नही)/u;

function clauses(s: string): string[] {
  return s.split(/[.;!?,।\n]| and | but | और | लेकिन /).map((c) => c.trim()).filter(Boolean);
}

function isNegated(clause: string, index: number, matchLen: number): boolean {
  const before = clause.slice(0, index);
  const after = clause.slice(index + matchLen);
  return NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after);
}

export function parseSymptoms(text: string): Symptom[] {
  const s = normalize(text);
  const found = new Set<Symptom>();
  for (const clause of clauses(s)) {
    for (const { code, patterns } of SYMPTOMS) {
      for (const p of patterns) {
        const m = p.exec(clause);
        if (m && !isNegated(clause, m.index, m[0].length)) {
          found.add(code);
          break;
        }
      }
    }
  }
  // "Blood in sputum" is not vaginal bleeding.
  if (found.has('hemoptysis') && !/bleeding|रक्तस्राव|ब्लीडिंग|खून (?:आ|जा|बह)/.test(s.replace(/(?:बलगम|खांसी|खाँसी) में खून/g, ''))) {
    found.delete('bleeding_pv');
  }
  // "Cough for 2 weeks" mentions cough; a plain fever word inside "fever" check is fine.
  return [...found];
}

export function parseFetalMovement(text: string): Vitals['fetalMovement'] {
  const s = normalize(text);
  if (/no (?:fetal |baby )?movement|baby (?:is )?not moving|movement absent|(?:हलचल|हिलना) (?:नहीं|बंद)|नहीं हिल/.test(s)) return 'absent';
  if (/(?:reduced|less|decreased|low) (?:fetal |baby )?movement|movement (?:is )?(?:reduced|less|decreased)|(?:हलचल|हिलना) कम|कम हिल/.test(s)) return 'reduced';
  if (/(?:fetal |baby )?movement (?:is )?(?:normal|good|fine|ok)|(?:हलचल|हिलना) (?:ठीक|सामान्य)/.test(s)) return 'normal';
  return undefined;
}

/** Extracts whatever it can recognise. Missing values stay undefined. */
export function parseTranscript(text: string): ParsedVitals {
  const s = normalize(text);
  const out: ParsedVitals = {};

  Object.assign(out, parseBP(s));

  const hb = firstNumber(s, ['hemoglobin', 'haemoglobin', 'hb', 'h\\.b\\.?', 'हीमोग्लोबिन', 'हिमोग्लोबिन', 'एचबी']);
  if (hb != null && hb >= 2 && hb <= 20) out.hemoglobin = hb;

  const wt = firstNumber(s, ['weight', 'वजन', 'वज़न']);
  if (wt != null && wt > 0.3 && wt < 200) out.weightKg = wt;

  const temp = firstNumber(s, ['temperature', 'temp', 'तापमान', 'टेम्परेचर', 'बुखार']);
  if (temp != null) {
    const c = temp > 45 ? Math.round(((temp - 32) * 5) / 9 * 10) / 10 : temp; // spoken °F -> °C
    if (c >= 30 && c <= 43) out.temperatureC = c;
  }

  const pulse = firstNumber(s, ['pulse', 'heart rate', 'नाड़ी', 'नाडी', 'पल्स', 'धड़कन']);
  if (pulse != null && pulse >= 30 && pulse <= 250) out.pulse = pulse;

  const rr = firstNumber(s, ['respiratory rate', 'resp rate', 'breathing rate', 'breaths', 'सांस की दर', 'सांस', 'साँस']);
  if (rr != null && rr >= 8 && rr <= 120) out.respRate = rr;

  const spo2 = firstNumber(s, ['spo2', 'sp o2', 'oxygen', 'saturation', 'ऑक्सीजन', 'ऑक्सिजन']);
  if (spo2 != null && spo2 >= 50 && spo2 <= 100) out.spo2 = spo2;

  const fasting = firstNumber(s, ['fasting sugar', 'fasting blood sugar', 'fasting', 'खाली पेट शुगर', 'खाली पेट']);
  if (fasting != null && fasting >= 20 && fasting <= 600) out.bloodSugarFasting = fasting;
  const sugar = firstNumber(s, ['random sugar', 'random blood sugar', 'blood sugar', 'sugar', 'glucose', 'शुगर', 'शक्कर']);
  if (sugar != null && sugar >= 20 && sugar <= 600 && sugar !== out.bloodSugarFasting) out.bloodSugarRandom = sugar;

  const fm = parseFetalMovement(text);
  if (fm) out.fetalMovement = fm;

  const symptoms = parseSymptoms(text);
  if (symptoms.length) out.symptoms = symptoms;
  return out;
}

/** Fills only fields the ASHA has not already typed; symptoms are unioned. */
export function mergeParsed(current: ParsedVitals, parsed: ParsedVitals): { merged: ParsedVitals; filled: string[] } {
  const merged: ParsedVitals = { ...current };
  const filled: string[] = [];
  for (const [k, v] of Object.entries(parsed) as [keyof ParsedVitals, unknown][]) {
    if (k === 'symptoms') continue;
    if (merged[k] == null && v != null) {
      (merged as Record<string, unknown>)[k] = v;
      filled.push(k);
    }
  }
  if (parsed.symptoms?.length) {
    const set = new Set([...(current.symptoms ?? []), ...parsed.symptoms]);
    if (set.size > (current.symptoms?.length ?? 0)) filled.push('symptoms');
    merged.symptoms = [...set];
  }
  return { merged, filled };
}
