import { ageYears, gestationWeeks, isNewborn, isPregnant } from './clinical';
import { t } from '../data/i18n';
import type {
  Lang,
  Patient,
  ReferralUrgency,
  RiskAlert,
  RiskLevel,
  Severity,
  Symptom,
  Visit,
  Vitals,
} from '../types';

/**
 * Deterministic, offline risk rules for ASHA home visits.
 *
 * Thresholds follow public Indian / WHO guidance (MoHFW ANC & HBNC guidelines, IMNCI
 * young-infant danger signs, NPCDCS screening cut-offs, NTEP presumptive-TB criteria).
 * They are a screening aid for referral, not a diagnosis.
 */

export const SEVERITY_RANK: Record<RiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function maxRisk(levels: Iterable<RiskLevel>): RiskLevel {
  let best: RiskLevel = 'none';
  for (const l of levels) if (SEVERITY_RANK[l] > SEVERITY_RANK[best]) best = l;
  return best;
}

type Evidence = RiskAlert['evidence'][number];

export interface RuleContext {
  patient: Patient;
  visit: Visit;
  v: Vitals;
  sym: Set<Symptom>;
  pregnant: boolean;
  newborn: boolean;
  ageY: number;
  gaWeeks?: number;
  lang: Lang;
}

interface Hit {
  evidence: Evidence[];
  params?: Record<string, string | number>;
}

export interface Rule {
  id: string;
  severity: Severity;
  source: string;
  appliesTo: (c: RuleContext) => boolean;
  check: (c: RuleContext) => Hit | null;
  /** Rules that should not also fire when this one does (e.g. severe BP hides high BP). */
  supersedes?: string[];
}

const SRC_ANC = 'MoHFW ANC guidelines';
const SRC_HBNC = 'MoHFW HBNC / IMNCI young infant';
const SRC_NCD = 'NPCDCS screening';
const SRC_TB = 'NTEP presumptive TB';
const SRC_GEN = 'General danger signs';

// ---- evidence helpers ----
const ev = (field: string, value: string | number, op: string, threshold: string | number): Evidence => ({
  field,
  value,
  op,
  threshold,
});
const has = (c: RuleContext, s: Symptom) => c.sym.has(s);
const symEv = (s: Symptom): Evidence => ev('symptoms', s, 'present', 'true');
const symNames = (c: RuleContext, list: Symptom[]) => list.map((s) => t(`sym.${s}`, c.lang)).join(', ');

function bpHit(c: RuleContext, sysT: number, diaT: number): Hit | null {
  const { systolic: s, diastolic: d } = c.v;
  const e: Evidence[] = [];
  if (s != null && s >= sysT) e.push(ev('systolic', s, '>=', sysT));
  if (d != null && d >= diaT) e.push(ev('diastolic', d, '>=', diaT));
  return e.length ? { evidence: e, params: { sys: s ?? '–', dia: d ?? '–' } } : null;
}

function symptomHit(c: RuleContext, list: Symptom[]): Hit | null {
  const found = list.filter((s) => has(c, s));
  return found.length ? { evidence: found.map(symEv), params: { signs: symNames(c, found) } } : null;
}

function below(field: keyof Vitals, threshold: number, paramName: string) {
  return (c: RuleContext): Hit | null => {
    const val = c.v[field];
    return typeof val === 'number' && val < threshold
      ? { evidence: [ev(field, val, '<', threshold)], params: { [paramName]: val } }
      : null;
  };
}
function atLeast(field: keyof Vitals, threshold: number, paramName: string) {
  return (c: RuleContext): Hit | null => {
    const val = c.v[field];
    return typeof val === 'number' && val >= threshold
      ? { evidence: [ev(field, val, '>=', threshold)], params: { [paramName]: val } }
      : null;
  };
}

const pregnant = (c: RuleContext) => c.pregnant;
const newborn = (c: RuleContext) => c.newborn;
const notNewborn = (c: RuleContext) => !c.newborn;
const adultNotPregnant = (c: RuleContext) => !c.pregnant && c.ageY >= 18;
const PREECLAMPSIA_SIGNS: Symptom[] = ['severe_headache', 'blurred_vision', 'swelling_face_hands', 'severe_abdominal_pain'];
const NEWBORN_DANGER: Symptom[] = ['not_feeding', 'convulsions', 'chest_indrawing', 'lethargy'];

export const RULES: Rule[] = [
  // ---------------- Pregnancy ----------------
  {
    id: 'preg_convulsions', severity: 'critical', source: SRC_ANC, appliesTo: pregnant,
    check: (c) => symptomHit(c, ['convulsions']),
  },
  {
    id: 'preg_bleeding', severity: 'critical', source: SRC_ANC, appliesTo: pregnant,
    check: (c) => symptomHit(c, ['bleeding_pv']),
  },
  {
    id: 'preg_preeclampsia_signs', severity: 'critical', source: SRC_ANC, appliesTo: pregnant,
    supersedes: ['preg_bp_high', 'preg_bp_severe', 'preg_abdominal_pain'],
    check: (c) => {
      const bp = bpHit(c, 140, 90);
      const signs = symptomHit(c, PREECLAMPSIA_SIGNS);
      return bp && signs ? { evidence: [...bp.evidence, ...signs.evidence], params: { ...bp.params, ...signs.params } } : null;
    },
  },
  {
    id: 'preg_bp_severe', severity: 'critical', source: SRC_ANC, appliesTo: pregnant, supersedes: ['preg_bp_high'],
    check: (c) => bpHit(c, 160, 110),
  },
  {
    id: 'preg_bp_high', severity: 'high', source: SRC_ANC, appliesTo: pregnant,
    check: (c) => bpHit(c, 140, 90),
  },
  {
    id: 'preg_anaemia_severe', severity: 'critical', source: SRC_ANC, appliesTo: pregnant, supersedes: ['preg_anaemia_moderate'],
    check: below('hemoglobin', 7, 'hb'),
  },
  {
    id: 'preg_anaemia_moderate', severity: 'medium', source: SRC_ANC, appliesTo: pregnant,
    check: below('hemoglobin', 10, 'hb'),
  },
  {
    id: 'preg_fetal_movement_absent', severity: 'critical', source: SRC_ANC,
    appliesTo: (c) => c.pregnant && (c.gaWeeks ?? 0) >= 20,
    check: (c) =>
      c.v.fetalMovement === 'absent'
        ? { evidence: [ev('fetalMovement', 'absent', '==', 'absent')], params: { ga: c.gaWeeks ?? '' } }
        : null,
  },
  {
    id: 'preg_fetal_movement_reduced', severity: 'high', source: SRC_ANC,
    appliesTo: (c) => c.pregnant && (c.gaWeeks ?? 0) >= 20,
    check: (c) =>
      c.v.fetalMovement === 'reduced'
        ? { evidence: [ev('fetalMovement', 'reduced', '==', 'reduced')], params: { ga: c.gaWeeks ?? '' } }
        : null,
  },
  {
    id: 'preg_leaking', severity: 'high', source: SRC_ANC, appliesTo: pregnant,
    check: (c) => (has(c, 'leaking_fluid') ? { evidence: [symEv('leaking_fluid')], params: { ga: c.gaWeeks ?? '' } } : null),
  },
  {
    id: 'preg_abdominal_pain', severity: 'high', source: SRC_ANC, appliesTo: pregnant,
    check: (c) => symptomHit(c, ['severe_abdominal_pain']),
  },
  {
    id: 'preg_fever', severity: 'high', source: SRC_ANC, appliesTo: pregnant, supersedes: ['gen_fever', 'gen_high_fever'],
    check: (c) => {
      const hit = atLeast('temperatureC', 38, 'temp')(c);
      if (hit) return hit;
      return has(c, 'fever') ? { evidence: [symEv('fever')], params: { temp: '–' } } : null;
    },
  },
  {
    id: 'preg_post_dates', severity: 'medium', source: SRC_ANC, appliesTo: pregnant,
    check: (c) =>
      (c.gaWeeks ?? 0) >= 41 ? { evidence: [ev('gestationWeeks', c.gaWeeks!, '>=', 41)], params: { ga: c.gaWeeks! } } : null,
  },

  // ---------------- Newborn / young infant ----------------
  {
    id: 'nb_danger_sign', severity: 'critical', source: SRC_HBNC, appliesTo: newborn,
    check: (c) => symptomHit(c, NEWBORN_DANGER),
  },
  {
    id: 'nb_fast_breathing', severity: 'high', source: SRC_HBNC, appliesTo: newborn,
    check: atLeast('respRate', 60, 'rr'),
  },
  {
    id: 'nb_fever', severity: 'high', source: SRC_HBNC, appliesTo: newborn,
    check: (c) => {
      const hit = atLeast('temperatureC', 37.5, 'temp')(c);
      if (hit) return hit;
      return has(c, 'fever') ? { evidence: [symEv('fever')], params: { temp: '–' } } : null;
    },
  },
  {
    id: 'nb_hypothermia', severity: 'high', source: SRC_HBNC, appliesTo: newborn,
    check: (c) => {
      const tC = c.v.temperatureC;
      if (tC != null && tC < 35.5) return { evidence: [ev('temperatureC', tC, '<', 35.5)], params: { tempText: `, ${tC} °C` } };
      return has(c, 'cold_to_touch') ? { evidence: [symEv('cold_to_touch')], params: { tempText: '' } } : null;
    },
  },
  {
    id: 'nb_jaundice', severity: 'high', source: SRC_HBNC, appliesTo: newborn,
    check: (c) => symptomHit(c, ['jaundice']),
  },
  {
    id: 'nb_umbilical', severity: 'medium', source: SRC_HBNC, appliesTo: newborn,
    check: (c) => symptomHit(c, ['umbilical_redness']),
  },
  {
    id: 'nb_lbw_very', severity: 'high', source: SRC_HBNC, supersedes: ['nb_lbw'],
    appliesTo: (c) => c.newborn && c.patient.newborn?.birthWeightKg != null,
    check: (c) => {
      const bw = c.patient.newborn!.birthWeightKg!;
      return bw < 1.5 ? { evidence: [ev('birthWeightKg', bw, '<', 1.5)], params: { bw } } : null;
    },
  },
  {
    id: 'nb_lbw', severity: 'medium', source: SRC_HBNC,
    appliesTo: (c) => c.newborn && c.patient.newborn?.birthWeightKg != null,
    check: (c) => {
      const bw = c.patient.newborn!.birthWeightKg!;
      return bw < 2.5 ? { evidence: [ev('birthWeightKg', bw, '<', 2.5)], params: { bw } } : null;
    },
  },

  // ---------------- General (everyone) ----------------
  {
    id: 'gen_spo2_critical', severity: 'critical', source: SRC_GEN, appliesTo: () => true, supersedes: ['gen_spo2_low'],
    check: below('spo2', 90, 'spo2'),
  },
  {
    id: 'gen_spo2_low', severity: 'high', source: SRC_GEN, appliesTo: () => true,
    check: below('spo2', 94, 'spo2'),
  },
  {
    id: 'gen_chest_pain_breathless', severity: 'critical', source: SRC_GEN, appliesTo: notNewborn, supersedes: ['gen_breathless'],
    check: (c) =>
      has(c, 'chest_pain') && has(c, 'breathlessness')
        ? { evidence: [symEv('chest_pain'), symEv('breathlessness')] }
        : null,
  },
  {
    id: 'gen_breathless', severity: 'high', source: SRC_GEN, appliesTo: notNewborn,
    check: (c) => symptomHit(c, ['breathlessness']),
  },
  {
    id: 'gen_high_fever', severity: 'high', source: SRC_GEN, appliesTo: notNewborn, supersedes: ['gen_fever'],
    check: atLeast('temperatureC', 39.5, 'temp'),
  },
  {
    id: 'gen_fever', severity: 'medium', source: SRC_GEN, appliesTo: notNewborn,
    check: atLeast('temperatureC', 38, 'temp'),
  },
  {
    id: 'gen_tachycardia', severity: 'high', source: SRC_GEN, appliesTo: (c) => c.ageY >= 12,
    check: atLeast('pulse', 120, 'pulse'),
  },

  // ---------------- NCD (non-pregnant adults) ----------------
  {
    id: 'ncd_bp_crisis', severity: 'critical', source: SRC_NCD, appliesTo: adultNotPregnant, supersedes: ['ncd_bp_high'],
    check: (c) => bpHit(c, 180, 120),
  },
  {
    id: 'ncd_bp_high', severity: 'medium', source: SRC_NCD, appliesTo: adultNotPregnant,
    check: (c) => bpHit(c, 140, 90),
  },
  {
    id: 'ncd_hypoglycemia', severity: 'high', source: SRC_NCD, appliesTo: notNewborn,
    check: (c) => {
      const s = c.v.bloodSugarRandom ?? c.v.bloodSugarFasting;
      const field = c.v.bloodSugarRandom != null ? 'bloodSugarRandom' : 'bloodSugarFasting';
      return s != null && s < 70 ? { evidence: [ev(field, s, '<', 70)], params: { sugar: s } } : null;
    },
  },
  {
    id: 'ncd_sugar_very_high', severity: 'high', source: SRC_NCD, appliesTo: notNewborn, supersedes: ['ncd_sugar_high'],
    check: atLeast('bloodSugarRandom', 300, 'sugar'),
  },
  {
    id: 'ncd_sugar_high', severity: 'medium', source: SRC_NCD, appliesTo: notNewborn,
    check: (c) => {
      const r = c.v.bloodSugarRandom;
      const f = c.v.bloodSugarFasting;
      if (r != null && r >= 200) return { evidence: [ev('bloodSugarRandom', r, '>=', 200)], params: { sugar: r, kind: '' } };
      if (f != null && f >= 126) return { evidence: [ev('bloodSugarFasting', f, '>=', 126)], params: { sugar: f, kind: ', fasting' } };
      return null;
    },
  },

  // ---------------- TB ----------------
  {
    id: 'tb_hemoptysis', severity: 'high', source: SRC_TB, appliesTo: notNewborn,
    check: (c) => symptomHit(c, ['hemoptysis']),
  },
  {
    id: 'tb_presumptive', severity: 'high', source: SRC_TB, supersedes: ['tb_hemoptysis'],
    appliesTo: (c) => notNewborn(c) && !(c.patient.conditions ?? []).includes('tb_on_treatment'),
    check: (c) => {
      const cough = has(c, 'cough_2_weeks');
      const others = (['weight_loss', 'night_sweats', 'hemoptysis'] as Symptom[]).filter((s) => has(c, s));
      const feverWithOthers = has(c, 'fever') && others.length > 0;
      if (!cough && !(others.length >= 2) && !feverWithOthers) return null;
      const found = [...(cough ? (['cough_2_weeks'] as Symptom[]) : []), ...others, ...(feverWithOthers ? (['fever'] as Symptom[]) : [])];
      return { evidence: found.map(symEv), params: { signs: symNames(c, found) } };
    },
  },
];

export function buildContext(patient: Patient, visit: Visit, lang: Lang): RuleContext {
  const at = visit.vitals?.recordedAt ?? visit.visitedAt;
  const preg = isPregnant(patient, at);
  return {
    patient,
    visit,
    v: visit.vitals ?? { recordedAt: at },
    sym: new Set(visit.vitals?.symptoms ?? []),
    pregnant: preg,
    newborn: isNewborn(patient, at),
    ageY: ageYears(patient.dob, at),
    gaWeeks: preg ? gestationWeeks(patient.pregnancy!.lmp, at) : undefined,
    lang,
  };
}

/** Evaluates every rule against one visit. Output is sorted most severe first and has stable ids. */
export function evaluateVisit(patient: Patient, visit: Visit, lang: Lang = 'en', rules: Rule[] = RULES): RiskAlert[] {
  if (visit.status === 'not_at_home') return [];
  const ctx = buildContext(patient, visit, lang);
  const fired: { rule: Rule; hit: Hit }[] = [];
  for (const rule of rules) {
    if (!rule.appliesTo(ctx)) continue;
    const hit = rule.check(ctx);
    if (hit) fired.push({ rule, hit });
  }
  const suppressed = new Set(fired.flatMap((f) => f.rule.supersedes ?? []));
  return fired
    .filter((f) => !suppressed.has(f.rule.id))
    .map(({ rule, hit }) => {
      const reasonKey = `rule.${rule.id}`;
      const reasonParams = hit.params ?? {};
      return {
        id: `${patient.id}:${rule.id}:${visit.id}`,
        patientId: patient.id,
        visitId: visit.id,
        ruleId: rule.id,
        severity: rule.severity,
        reason: t(reasonKey, lang, reasonParams),
        reasonKey,
        reasonParams,
        evidence: hit.evidence,
        source: rule.source,
        createdAt: visit.visitedAt,
        acknowledged: false,
      } satisfies RiskAlert;
    })
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

export function urgencyFor(alerts: RiskAlert[]): ReferralUrgency {
  const top = maxRisk(alerts.map((a) => a.severity));
  return top === 'critical' ? 'emergency' : top === 'high' ? 'urgent' : 'routine';
}

/** Re-render an alert's reason in another language (e.g. doctor reads English, ASHA reads Hindi). */
export function localizeAlert(a: RiskAlert, lang: Lang): string {
  return t(a.reasonKey, lang, a.reasonParams);
}
