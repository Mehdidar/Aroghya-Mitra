/**
 * The prescription check the doctor sees before saving (AI copilot, feature F):
 * allergy, interaction, pregnancy and duplicate warnings for the medicines on
 * the form, against the patient's allergies, pregnancy and current medicines.
 *
 * Deterministic and offline. Warnings never block silently: the screen shows
 * every one and the doctor must tick "I have reviewed this" before saving.
 * Every rule here needs clinical review (see catalog.ts, interactions.ts, safety.ts).
 */
import { findMedicine, type Medicine } from './catalog.ts';
import { INTERACTIONS, type Interaction } from './interactions.ts';
import { allergyHits, pregnancyHits, type PregnancyContext } from './safety.ts';

export type WarningKind = 'allergy' | 'interaction' | 'pregnancy' | 'duplicate' | 'unrecognised';
export type WarningSeverity = 'contraindicated' | 'major' | 'moderate' | 'caution' | 'info';

export interface PrescriptionWarning {
  /** Stable across re-renders, so an acknowledgement sticks to the same warning. */
  id: string;
  kind: WarningKind;
  severity: WarningSeverity;
  /** Medicine names as written on the form (or the current medicine). */
  medicines: string[];
  /** Short English text (medicine names stay English); the app adds a translated heading by kind. */
  message: string;
  advice: string | null;
  source: string;
  ruleId: string;
  needsClinicalReview: true;
}

export interface CheckInput {
  /** The medicines on the form. */
  items: { name: string }[];
  allergies: string[];
  pregnancy: PregnancyContext;
  /** Medicines the patient is already taking (active prescriptions), by name. */
  currentMedicines: string[];
}

const SEVERITY_RANK: Record<WarningSeverity, number> = { contraindicated: 5, major: 4, moderate: 3, caution: 2, info: 1 };

function sideMatches(side: string[], med: Medicine): boolean {
  return side.some((s) => (s.startsWith('class:') ? med.classes.includes(s.slice(6) as Medicine['classes'][number]) : s === med.id));
}

function interactionBetween(x: Medicine, y: Medicine): Interaction[] {
  return INTERACTIONS.filter((i) => (sideMatches(i.a, x) && sideMatches(i.b, y)) || (sideMatches(i.a, y) && sideMatches(i.b, x)));
}

export function checkPrescription(input: CheckInput): PrescriptionWarning[] {
  const out: PrescriptionWarning[] = [];
  const add = (w: Omit<PrescriptionWarning, 'needsClinicalReview'>) => {
    if (!out.some((o) => o.id === w.id)) out.push({ ...w, needsClinicalReview: true });
  };

  const items = input.items.map((it) => ({ name: it.name.trim(), med: findMedicine(it.name) })).filter((it) => it.name);
  const current = input.currentMedicines.map((name) => ({ name: name.trim(), med: findMedicine(name) })).filter((c) => c.name && c.med);

  for (const it of items) {
    if (!it.med) {
      add({ id: `unrecognised:${it.name.toLowerCase()}`, kind: 'unrecognised', severity: 'info', medicines: [it.name], message: `${it.name} is not in the medicine list, so allergy, interaction and pregnancy checks could not run for it.`, advice: 'Check it yourself.', source: 'Copilot medicine list (NLEM 2022)', ruleId: 'unrecognised' });
      continue;
    }
    for (const h of allergyHits(it.med, it.name, input.allergies)) {
      add({ id: `allergy:${it.med.id}:${h.ruleId}:${h.allergy.toLowerCase()}`, kind: 'allergy', severity: h.level, medicines: [it.name], message: `${it.name}: patient allergy "${h.allergy}". ${h.note}`, advice: h.level === 'contraindicated' ? 'Choose a medicine from another class.' : 'Use only if the allergy history allows; watch for a reaction.', source: h.source, ruleId: h.ruleId });
    }
    for (const h of pregnancyHits(it.med, input.pregnancy)) {
      const weeks = input.pregnancy.weeks;
      add({ id: `pregnancy:${it.med.id}:${h.ruleId}`, kind: 'pregnancy', severity: h.level === 'avoid' ? 'major' : h.level, medicines: [it.name], message: `${it.name} in pregnancy${weeks ? ` (${weeks} weeks)` : ''}: ${h.note}${h.weeksUnknown ? ' Gestational age not recorded: confirm.' : ''}`, advice: null, source: h.source, ruleId: h.ruleId });
    }
  }

  // Interactions: each pair on the form, and each form medicine against what the patient already takes.
  const pairs: [typeof items[number], { name: string; med: Medicine | null }][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) pairs.push([items[i], items[j]]);
    for (const c of current) pairs.push([items[i], c]);
  }
  for (const [x, y] of pairs) {
    if (!x.med || !y.med) continue;
    if (x.med.id === y.med.id) {
      const onForm = items.includes(y as typeof items[number]);
      add({ id: `duplicate:${x.med.id}`, kind: 'duplicate', severity: 'moderate', medicines: [x.name, y.name], message: onForm ? `${x.med.generic} is on the prescription twice.` : `${x.name}: the patient already takes ${y.name}.`, advice: 'Remove one, or confirm it is meant to continue.', source: 'Prescription check', ruleId: 'duplicate' });
      continue;
    }
    for (const i of interactionBetween(x.med, y.med)) {
      const pair = [x.med.id, y.med.id].sort().join('+');
      add({ id: `interaction:${i.id}:${pair}`, kind: 'interaction', severity: i.severity, medicines: [x.name, y.name], message: `${x.name} + ${y.name}: ${i.effect}`, advice: i.advice, source: i.source, ruleId: i.id });
    }
  }

  return out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.id.localeCompare(b.id));
}

/** True when every warning id is in the acknowledged set. */
export function allAcknowledged(warnings: PrescriptionWarning[], acknowledged: Iterable<string>): boolean {
  const set = new Set(acknowledged);
  return warnings.every((w) => set.has(w.id));
}
