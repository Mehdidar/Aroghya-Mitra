// npm run review:clinical → docs/CLINICAL_REVIEW.md
// A sign-off sheet for the clinician, generated from the code itself so it always matches what the app does:
// every ASHA risk rule (with its exact cut-offs), every chatbot health summary, every emergency phrase,
// the assistant's personal safety rules, the copilot's prescription warnings and referral ranking, and the preventive guidelines.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const { RED_FLAG_TERMS } = await import(resolve(root, 'packages/patient-ai/safety/redFlagTerms.ts'));
const { KNOWLEDGE_BASE } = await import(resolve(root, 'server/ai/chat/knowledge.ts'));
const { SYMPTOM_RULES } = await import(resolve(root, 'packages/patient-ai/triage/symptomCheck.ts'));
const { INTERACTIONS } = await import(resolve(root, 'packages/records/medicines/interactions.ts'));
const { ALLERGY_RULES, PREGNANCY_RULES } = await import(resolve(root, 'packages/records/medicines/safety.ts'));
const { MEDICINE_LIST_SOURCE } = await import(resolve(root, 'packages/records/medicines/catalog.ts'));
const { SEVERITY_ORDER, URGENCY_ORDER, PREGNANCY_HTN_RULES } = await import(resolve(root, 'packages/records/records/prioritise.ts'));
const { LAB_TESTS } = await import(resolve(root, 'server/copilot/labs.ts'));
const { GUIDELINES } = await import(resolve(root, 'packages/patient-ai/prevention/guidelines/index.ts'));

// The assistant's personal safety rules (server/ai/chat/personalSafety.ts) are code, not a table: described here by hand.
const PERSONAL_RULES = [
  ['allergy_match', 'The message names something on the patient\'s allergy list, or a medicine of the same family (penicillins, sulfa drugs, NSAIDs incl. aspirin).', 'Warning above the reply'],
  ['nsaid_pregnancy', 'Pregnant at 20 weeks or more and the message names an NSAID painkiller (ibuprofen, diclofenac, …). Low-dose aspirin is deliberately left out.', 'Warning above the reply'],
  ['ace_arb_pregnancy', 'Pregnant (any week) and the message names an ACE inhibitor or ARB (names ending in -pril or -sartan).', 'Warning above the reply'],
  ['preg_htn_warning_sign', 'Pregnant with high blood pressure in the record and the message mentions headache, blurred vision, swelling, upper stomach pain or the baby moving less.', '**108 banner, no AI answer**'],
  ['preg_danger_sign', 'Pregnant (no high BP recorded) and the message mentions blurred vision, upper stomach pain or the baby moving less.', '**108 banner, no AI answer**'],
  ['high_salt_bp', 'High blood pressure in the record and the message names a salty food (pickle, papad, namkeen, chips, dry fish, instant noodles, …).', 'Warning above the reply'],
  ['dose_change', 'The message is about stopping, skipping, doubling or changing a current medicine.', 'Warning: ask the doctor first'],
];
const PREVENTION_OPEN_QUESTIONS = [
  'WHO growth tables: the weight-for-age and length/height-for-age LMS values are a sparse set, not the full WHO monthly tables. Replace before clinical use; every z-score is marked uncertain.',
  'fIPV-3 at 9 months: national schedule or state protocol?',
  'Vaccine upper age limits (RVV, fIPV, PCV, JE); 8-week minimum gap fIPV-1/2 and PCV-1/2; 150-day gap for Vitamin A doses 3–9.',
  'Td in pregnancy: Td-2 before 36 weeks; Td-1 due by 12 weeks.',
  'ANC: 4 visits used (WHO 2016 eight-contact model shown for reference only); ultrasound 18–22 weeks; birth plan 28–36 weeks; PMSMA holiday shift not modelled.',
  'HBNC: a visit counts if within ±2 days of the scheduled day; extra visits for low birth weight not modelled.',
  'Anaemia recheck intervals: pregnant 30 days, moderate 30, mild 90. "Biweekly" IFA syrup for 6–59 months read as twice a week.',
  'NP-NCD: BP and sugar yearly, cancers every 5 years; cervical screening upper age 65; random sugar cut-off 140 mg/dL; BP 180/110 as urgent; 90-day grace before overdue.',
  'Growth monitoring: monthly under 3 years, quarterly 3–6 years; faltering = no gain over 28 days; newborn back to birth weight by day 14.',
  '28-day grace before a vaccine shows overdue.',
  'Danger-sign list and the text patterns that mark a pregnancy high risk.',
];
const COPILOT_INFERENCES = [
  'A medicine with no duration counts as current for 90 days.',
  'Dose times are guessed from frequency words ("twice" → morning and night).',
  'Temperatures dictated in °F are converted to °C.',
  'Implausible vitals in a dictated note are dropped, not corrected.',
];
const range = (lo, hi) => (lo === null || lo === undefined ? `≤ ${hi}` : hi === null || hi === undefined ? `≥ ${lo}` : `${lo}–${hi}`);
const names = (xs) => xs.map((x) => x.replace(/^class:/, 'class: ')).join(', ');

// Hand-written (checked against rules.ts) where the code is not a single helper call.
const OVERRIDE = {
  nb_hypothermia: 'temperature < 35.5 °C, or feels cold to touch',
  nb_lbw_very: 'birth weight < 1.5 kg',
  nb_lbw: 'birth weight < 2.5 kg',
  gen_chest_pain_breathless: 'chest pain **and** breathlessness together',
  ncd_hypoglycemia: 'blood sugar (random, or fasting if no random) < 70 mg/dL',
  ncd_sugar_high: 'random blood sugar ≥ 200 mg/dL, or fasting blood sugar ≥ 126 mg/dL',
  tb_presumptive: 'cough for 2 weeks or more; **or** any 2 of weight loss, night sweats, coughing blood; **or** fever plus any 1 of those',
};
// Rules whose automatic reading was checked by hand. A new rule fails the script until someone checks it here.
const CHECKED = new Set(['preg_convulsions','preg_bleeding','preg_preeclampsia_signs','preg_bp_severe','preg_bp_high','preg_anaemia_severe','preg_anaemia_moderate','preg_fetal_movement_absent','preg_fetal_movement_reduced','preg_leaking','preg_abdominal_pain','preg_fever','preg_post_dates','nb_danger_sign','nb_fast_breathing','nb_fever','nb_hypothermia','nb_jaundice','nb_umbilical','gen_spo2_critical','gen_spo2_low','gen_breathless','gen_high_fever','gen_fever','gen_tachycardia','ncd_bp_crisis','ncd_bp_high','ncd_sugar_very_high','tb_hemoptysis', ...Object.keys(OVERRIDE)]);
const APPLIES = { pregnant: 'pregnant women', newborn: 'young infants (up to 59 days; up to 90 days if registered as a newborn)', notNewborn: 'everyone except newborns', adultNotPregnant: 'adults (18 and over) who are not pregnant', '() => true': 'everyone' };

// Turn the rule code into a condition a clinician can read; anything left unexplained stays as code.
function plain(code) {
  const UNIT = { hemoglobin: 'Hb (g/dL)', temperatureC: 'temperature (°C)', respRate: 'breathing rate (/min)', pulse: 'pulse (/min)', spo2: 'SpO₂ (%)', bloodSugarRandom: 'random blood sugar (mg/dL)', bloodSugarFasting: 'fasting blood sugar (mg/dL)', weightKg: 'weight (kg)' };
  const f = (k) => UNIT[k] ?? k;
  let c = code.replace(/^\(c\) =>\s*/, '').replace(/,?\s*\}?\s*$/, '').trim();
  const parts = [];
  for (const m of c.matchAll(/bpHit\(c, (\d+), (\d+)\)/g)) parts.push(`BP ≥ ${m[1]}/${m[2]} mmHg (systolic ≥ ${m[1]} or diastolic ≥ ${m[2]})`);
  for (const m of c.matchAll(/below\('(\w+)', ([\d.]+)/g)) parts.push(`${f(m[1])} < ${m[2]}`);
  for (const m of c.matchAll(/atLeast\('(\w+)', ([\d.]+)/g)) parts.push(`${f(m[1])} ≥ ${m[2]}`);
  for (const m of c.matchAll(/symptomHit\(c, \[([^\]]+)\]\)/g)) parts.push(`any of these symptoms: ${m[1].replace(/'/g, '').split(',').map((x) => x.trim().replace(/_/g, ' ')).join(', ')}`);
  for (const m of c.matchAll(/has\(c, '(\w+)'\)/g)) parts.push(`symptom: ${m[1].replace(/_/g, ' ')}`);
  for (const m of c.matchAll(/fetalMovement === '(\w+)'/g)) parts.push(`fetal movement reported as ${m[1]}`);
  for (const m of c.matchAll(/gaWeeks \?\? 0\) >= (\d+) \?/g)) parts.push(`gestation ≥ ${m[1]} weeks`);
  if (!parts.length) return '`' + c.slice(0, 220) + (c.length > 220 ? '…' : '') + '`';
  const joiner = /bp && signs/.test(c) ? ' **and** ' : ' or ';
  return parts.join(joiner);
}

// ---- ASHA rules: parsed from the source text (the checks are code, so the code is shown) ----
const rulesSrc = read('apps/mobile/features/asha/logic/rules.ts');
const i18nSrc = read('apps/mobile/features/asha/data/i18n.ts');
const consts = Object.fromEntries([...rulesSrc.matchAll(/^const (SRC_\w+) = '([^']+)'/gm)].map((m) => [m[1], m[2]]));
const lists = Object.fromEntries([...rulesSrc.matchAll(/^const ([A-Z_]+): Symptom\[\] = \[([^\]]+)\]/gm)].map((m) => [m[1], m[2].replace(/'/g, '').trim()]));
const body = rulesSrc.slice(rulesSrc.indexOf('export const RULES'));
const blocks = body.split(/\n  \{\n/).slice(1).map((b) => b.split(/\n  \},?\n/)[0]);
const rules = blocks.map((b) => {
  const id = /id: '([^']+)'/.exec(b)?.[1];
  const severity = /severity: '([^']+)'/.exec(b)?.[1];
  const source = consts[/source: (\w+)/.exec(b)?.[1]] ?? '';
  const applies = /appliesTo: ([^,\n]+)/.exec(b)?.[1]?.trim() ?? '';
  let check = (/check: ([\s\S]*)$/.exec(b)?.[1] ?? '').replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();
  for (const [k, v] of Object.entries(lists)) check = check.replaceAll(k, `[${v}]`);
  check = OVERRIDE[id] ?? plain(check);
  const msg = new RegExp(`'rule\\.${id}': \\{\\s*en: '((?:[^'\\\\]|\\\\.)*)'`).exec(i18nSrc)?.[1] ?? '';
  return { id, severity, source, applies, check, msg };
}).filter((r) => r.id);

const plainApplies = (a, id) =>
  APPLIES[a] ??
  ({ preg_fetal_movement_absent: 'pregnant women from 20 weeks', preg_fetal_movement_reduced: 'pregnant women from 20 weeks', nb_lbw_very: 'newborns with a recorded birth weight', nb_lbw: 'newborns with a recorded birth weight', gen_tachycardia: 'age 12 and over', tb_presumptive: 'everyone except newborns and people already on TB treatment' })[id] ??
  a.replace(/\(c\) =>\s*/, '').replace(/c\.pregnant/, 'pregnant').replace(/\(c\.gaWeeks \?\? 0\) >= (\d+)/, 'from $1 weeks').replace(/c\.ageY >= (\d+)/, 'age ≥ $1').replace(/&&/g, ',');
const unchecked = rules.filter((r) => !CHECKED.has(r.id)).map((r) => r.id);
if (unchecked.length) {
  console.error(`New or renamed ASHA rules need a checked description in scripts/clinical-review.mjs: ${unchecked.join(', ')}`);
  process.exit(1);
}
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const box = '☐ OK ☐ Change';
let md = `# Clinical review sheet

For the reviewing clinician. Generated from the app's code on ${new Date().toISOString().slice(0, 10)}
(\`npm run review:clinical\`), so it shows exactly what the app does today.

**How to use it.** For each row, tick OK or Change; for a change, write the correct
value in the notes column. Please also sign at the end. The engineering team
applies the changes and marks the items reviewed in the code.

The app is a **screening and referral aid** for ASHA workers and patients. It
does not diagnose. Every alert tells the ASHA worker to refer.

---

## 1. ASHA home-visit risk rules (${rules.length})

These run on the ASHA's phone and again on the server (the server's result wins).
\`bpHit(c, 140, 90)\` means systolic ≥ 140 **or** diastolic ≥ 90. Severity drives
the colour and the referral urgency: critical = emergency referral today,
high = refer within 24 hours, medium = refer / follow up this week, low = advice
and follow-up.

| # | Rule | Severity | Applies to | Fires when (code) | Message shown to the ASHA | Source | Review | Notes |
|---|---|---|---|---|---|---|---|---|
${rules.map((r, i) => `| ${i + 1} | \`${r.id}\` | ${r.severity} | ${esc(plainApplies(r.applies, r.id))} | ${esc(r.check)} | ${esc(r.msg)} | ${esc(r.source)} | ${box} | |`).join('\n')}

---

## 2. Chatbot health summaries (${KNOWLEDGE_BASE.length})

The chatbot may only state medical facts from these summaries. Each one is
currently marked **not reviewed**.

${KNOWLEDGE_BASE.map((d, i) => `### 2.${i + 1} ${d.title}

Source it summarises: ${d.source.org}, ${d.source.url}

> ${d.body.replace(/\n+/g, '\n> ')}
${d.emergencySteps?.length ? `\n**First-aid steps shown in an emergency:**\n\n${d.emergencySteps.map((s, j) => `${j + 1}. ${s}`).join('\n')}\n` : ''}
${box} — notes: ______________________________________________
`).join('\n')}

---

## 2b. Guided symptom check in the chat (${Object.keys(SYMPTOM_RULES).length} symptoms)

When a patient says they have one of these symptoms, the assistant asks these
questions one at a time (tap-to-answer), then names the **possible** causes
below, always as "this can happen with…, only a doctor or test can confirm".
A "yes" to a danger-sign question stops the check and shows the 108 banner.
Source: \`packages/patient-ai/triage/symptomCheck.ts\`.

${Object.values(SYMPTOM_RULES).map((r, i) => `### 2b.${i + 1} ${r.label}

| # | Question | Answers | Asked when | Danger sign |
|---|---|---|---|---|
${r.questions.map((q, j) => `| ${j + 1} | ${esc(q.text)} | ${q.options.join(' / ')} | ${q.askWhen ?? 'always'} | ${q.emergencyIfYes ? 'yes → 108' : ''} |`).join('\n')}

**Decision rules:**

${r.reviewSummary.map((line) => `- ${line}`).join('\n')}

${box} — notes: ______________________________________________
`).join('\n')}

---

## 3. Emergency phrases (show "Call 108" instantly)

If a patient types or says any of these, the app shows the emergency banner
before any AI answer. Please check two things: **nothing dangerous is missing**
(a missed emergency is the worst failure), and nothing common triggers it by
mistake. Languages other than English and Hindi also need a native speaker;
Odia, Assamese and Kashmiri were written without one.

${Object.entries(RED_FLAG_TERMS).map(([cat, rule]) => `### ${cat}

| Language | Phrases | Review |
|---|---|---|
${Object.entries(rule.terms).map(([lang, terms]) => `| ${lang} | ${esc(terms.join(' · '))} | ${box} |`).join('\n')}
`).join('\n')}

---

## 4. Personal safety rules in the health assistant (${PERSONAL_RULES.length})

Checked on the patient's own record **before** any AI answer. Source:
\`server/ai/chat/personalSafety.ts\`.

| Rule | When it fires | What the patient sees | Review |
|---|---|---|---|
${PERSONAL_RULES.map(([id, when, what]) => `| \`${id}\` | ${esc(when)} | ${what} | ${box} |`).join('\n')}

---

## 5. Doctor copilot: prescription warnings

The doctor picks every medicine, dose and duration; the app never issues a
prescription. Each warning below must be ticked "reviewed" by the doctor
before saving. Medicine list: ${MEDICINE_LIST_SOURCE.count} entries from
${MEDICINE_LIST_SOURCE.list} (strengths and forms typed by hand: please check
against the official list and the PHC stock). Source: \`packages/records/medicines/\`.

### 5.1 Interactions (${INTERACTIONS.length})

| Medicines | With | Severity | Effect | Advice shown | Review |
|---|---|---|---|---|---|
${INTERACTIONS.map((i) => `| ${esc(names(i.a))} | ${esc(names(i.b))} | ${i.severity} | ${esc(i.effect)} | ${esc(i.advice)} | ${box} |`).join('\n')}

### 5.2 Allergy rules (${ALLERGY_RULES.length})

An allergy written as a drug name also matches that medicine directly.

| Allergy words | Do not give (classes) | Caution (cross-reaction) | Note | Review |
|---|---|---|---|---|
${ALLERGY_RULES.map((r) => `| \`${esc(r.matches.source)}\` | ${r.avoidClasses.join(', ') || '—'} | ${r.cautionClasses.join(', ') || '—'} | ${esc(r.note)} | ${box} |`).join('\n')}

### 5.3 Pregnancy rules (${PREGNANCY_RULES.length})

| Medicines / classes | Level | From week | Note | Review |
|---|---|---|---|---|
${PREGNANCY_RULES.map((r) => `| ${esc([...(r.medicines ?? []), ...(r.classes ?? []).map((c) => `class: ${c}`)].join(', '))} | ${r.level} | ${r.fromWeek ?? 'whole pregnancy'} | ${esc(r.note)} | ${box} |`).join('\n')}

### 5.4 Lab reference ranges (${LAB_TESTS.length})

Used to flag results as high or low in the lab comparison. Values outside
"accepted" are refused as typing errors.

| Test | Unit | Normal range | In pregnancy | Accepted | Review |
|---|---|---|---|---|---|
${LAB_TESTS.map((t) => `| ${esc(t.name)} | ${esc(t.unit)} | ${t.grades ? 'nil' : range(t.low, t.high)} | ${t.pregnancy ? range(t.pregnancy.low, t.pregnancy.high) : ''} | ${t.plausible.join('–')} | ${box} |`).join('\n')}

### 5.5 Inferences in the summary and the dictated note

${COPILOT_INFERENCES.map((x) => `- ${x} ${box}`).join('\n')}

---

## 6. Doctor copilot: referral ranking

The doctor's referral inbox is sorted by these criteria, in this order. Each
card shows "Why here". Source: \`packages/records/records/prioritise.ts\`.

1. Alert severity: ${Object.entries(SEVERITY_ORDER).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(' > ')} (from the ASHA rule table above).
2. Referral urgency: ${Object.entries(URGENCY_ORDER).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(' > ')}.
3. Pregnancy with high blood pressure danger signs: rules ${PREGNANCY_HTN_RULES.map((r) => `\`${r}\``).join(', ')}, or a pregnant patient whose referral shows BP ≥ 140/90.
4. Not yet opened by the doctor.
5. Waiting longest.

${box} — notes: ______________________________________________

---

## 7. Preventive care guidelines (${GUIDELINES.length})

The vaccination, pregnancy, child growth, anaemia and screening plans are
computed from these national guidelines. ${GUIDELINES.filter((g) => g.status !== 'reviewed').length} of ${GUIDELINES.length} still need a
clinical review. Source: \`packages/patient-ai/prevention/guidelines/\`.

| Guideline | Document | Version | Link | Review due | Status | Review |
|---|---|---|---|---|---|---|
${GUIDELINES.map((g) => `| ${esc(g.title)} | ${esc(g.document)} (${esc(g.issuer)}) | ${esc(g.version)} | ${g.url ?? 'not verified online'} | ${g.reviewDue} | ${g.status.replace(/_/g, ' ')} | ${box} |`).join('\n')}

**Open questions for the reviewer:**

${PREVENTION_OPEN_QUESTIONS.map((x, i) => `${i + 1}. ${x} ${box}`).join('\n')}

---

## Sign-off

Reviewed by: ______________________  Registration no.: ______________

Signature: ______________________  Date: ______________
`;
writeFileSync(resolve(root, 'docs/CLINICAL_REVIEW.md'), md);
console.log(`docs/CLINICAL_REVIEW.md: ${rules.length} rules, ${KNOWLEDGE_BASE.length} summaries, ${Object.keys(SYMPTOM_RULES).length} symptom checks, ${Object.keys(RED_FLAG_TERMS).length} emergency categories, ${PERSONAL_RULES.length} personal rules, ${INTERACTIONS.length} interactions, ${ALLERGY_RULES.length} allergy and ${PREGNANCY_RULES.length} pregnancy rules, ${LAB_TESTS.length} lab ranges, ${GUIDELINES.length} guidelines`);
