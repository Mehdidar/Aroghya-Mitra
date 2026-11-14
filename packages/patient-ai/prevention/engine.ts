/**
 * The preventive plan: given a person and a day, what is due, overdue,
 * upcoming, ongoing or done, and what needs attention (flags). Pure and
 * deterministic: no clock, no network. Every item names the guideline id and
 * version it came from; the rules themselves live in ./guidelines/*.
 */
import { addAge, addDays, ageMonths, ageYears, diffDays, maxDay, minDay, toDay } from './dates.ts';
import { AMB, DEWORMING, HB_THRESHOLDS, IFA_PREGNANCY, RECHECK_DAYS, type AnaemiaGroup, type IfaRegimen } from './guidelines/anaemia.ts';
import { FALTER, GROWTH, LOW_BIRTH_WEIGHT_KG, MUAC, Z_CUTOFFS } from './guidelines/growth.ts';
import { guidelineById } from './guidelines/index.ts';
import {
  ALBENDAZOLE_PREGNANCY,
  ANC,
  ANC_VISITS,
  BIRTH_PLAN_RULES,
  CALCIUM,
  CALCIUM_RULES,
  FOLIC_ACID_RULES,
  HBNC,
  HBNC_DAYS,
  HIGH_RISK_CONDITIONS,
  PMSMA,
  PMSMA_RULES,
  ULTRASOUND_RULES,
} from './guidelines/maternal.ts';
import { BP_PREGNANCY, BP_THRESHOLDS, GRACE_DAYS, NPNCD, SCREENINGS, SUGAR_THRESHOLDS } from './guidelines/ncd.ts';
import { RBSK, RBSK_SCREENING } from './guidelines/rbsk.ts';
import { CHILD_DOSES, PREGNANCY_TD, UIP } from './guidelines/uip.ts';
import { growthIntervalDays, heightForAgeZ, weightForAgeZ } from './growth.ts';
import type {
  GuidelineMeta,
  GuidelineRef,
  GrowthMeasurement,
  PlanFlag,
  PlanItem,
  PlanStatus,
  PreventionPerson,
  PreventionPlan,
  ScreeningKind,
  ScreeningResult,
  VaccinationRecord,
} from './types.ts';

export interface PlanOptions {
  /** Upcoming items further away than this are left out (default 120 days). Pregnancy items are always shown. */
  horizonDays?: number;
}

const ref = (g: GuidelineMeta, uncertain?: boolean): GuidelineRef => ({ id: g.id, version: g.version, status: g.status, ...(uncertain ? { uncertain: true } : {}) });

/** Status from the window: done > upcoming > missed > overdue > due. */
export function windowStatus(asOf: string, w: { dueFrom: string | null; dueBy: string | null; lastDay?: string | null; doneOn?: string | null }): PlanStatus {
  if (w.doneOn) return 'done';
  if (w.dueFrom && asOf < w.dueFrom) return 'upcoming';
  if (w.lastDay && asOf > w.lastDay) return 'missed';
  if (w.dueBy && asOf > w.dueBy) return 'overdue';
  return 'due';
}

const ORDER: Record<PlanStatus, number> = { overdue: 0, due: 1, ongoing: 2, upcoming: 3, missed: 4, done: 5 };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

function latest<T extends { screenedOn?: string; measuredOn?: string }>(rows: T[], day: (r: T) => string): T | null {
  return rows.reduce<T | null>((a, b) => (a === null || day(b) >= day(a) ? b : a), null);
}

const screeningsOf = (p: PreventionPerson, kind: ScreeningKind, since?: string, until?: string) =>
  (p.screenings ?? []).filter((s) => s.kind === kind && (!since || s.screenedOn >= since) && (!until || s.screenedOn <= until)).sort((a, b) => (a.screenedOn < b.screenedOn ? -1 : 1));

const findDose = (vs: VaccinationRecord[], code: string, dose: number) => vs.filter((v) => v.vaccineCode === code && v.dose === dose).sort((a, b) => (a.givenOn < b.givenOn ? -1 : 1))[0];

const hasCondition = (p: PreventionPerson, patterns: RegExp[]) => (p.conditions ?? []).some((c) => patterns.some((re) => re.test(c)));

// ------------------------------------------------------------------- vaccines

function childVaccines(p: PreventionPerson, dob: string, asOf: string, horizon: number): PlanItem[] {
  const vs = p.vaccinations ?? [];
  const items: PlanItem[] = [];
  for (const d of CHILD_DOSES) {
    if (d.jeEndemicOnly && !p.jeEndemic) continue;
    const rec = findDose(vs, d.code, d.dose);
    const g = ref(UIP, d.uncertain);
    const base = { id: `uip:${d.code}:${d.dose}`, category: 'vaccine' as const, code: d.code, label: d.label, dose: d.dose, reason: { code: d.reason }, guideline: g };
    if (rec) {
      items.push({ ...base, status: 'done', dueFrom: addAge(dob, d.from), dueBy: null, doneOn: rec.givenOn, ...(rec.source === 'self_reported' ? { reason: { code: d.reason, params: { selfReported: 1 } } } : {}) });
      continue;
    }
    let dueFrom = addAge(dob, d.from);
    if (d.after) {
      const prev = findDose(vs, d.after.code, d.after.dose);
      if (!prev) continue; // only the next dose of a series is actionable
      dueFrom = maxDay(dueFrom, addDays(prev.givenOn, d.after.minDays))!;
    }
    const lastDay = d.lastAge ? addAge(dob, d.lastAge) : null;
    const dueByBase = d.dueBy ? addAge(dob, d.dueBy) : addDays(dueFrom, 28);
    const dueBy = minDay(maxDay(dueByBase, dueFrom), lastDay);
    const status = windowStatus(asOf, { dueFrom, dueBy, lastDay });
    if (status === 'upcoming' && diffDays(dueFrom, asOf) > horizon) continue;
    // A window that closed long ago is history, not a task.
    if (status === 'missed' && lastDay && diffDays(asOf, lastDay) > 365) continue;
    items.push({ ...base, status, dueFrom, dueBy, lastDay, reason: { code: d.reason, params: { label: d.label } } });
  }
  return items;
}

// ------------------------------------------------------------------ pregnancy

function pregnancyItems(p: PreventionPerson, lmp: string, asOf: string, flags: PlanFlag[]): PlanItem[] {
  const items: PlanItem[] = [];
  const ga = Math.floor(diffDays(asOf, lmp) / 7);
  const week = (w: number) => addDays(lmp, w * 7);
  const edd = addDays(lmp, 280);

  // ANC visits: the k-th recorded ANC visit of this pregnancy fulfils visit k.
  const anc = screeningsOf(p, 'anc', lmp);
  for (const v of ANC_VISITS) {
    const rec = anc[v.visit - 1];
    const dueFrom = week(v.fromWeek);
    const dueBy = addDays(week(v.byWeek), 6);
    items.push({
      id: `anc:visit:${v.visit}`,
      category: 'pregnancy',
      code: 'anc',
      dose: v.visit,
      status: windowStatus(asOf, { dueFrom, dueBy, doneOn: rec?.screenedOn }),
      dueFrom,
      dueBy,
      doneOn: rec?.screenedOn ?? null,
      reason: { code: `anc${v.visit}`, params: { from: v.fromWeek, to: v.byWeek } },
      guideline: ref(ANC, v.uncertain),
    });
  }

  // Td: two doses, or one booster after two doses in a pregnancy within 3 years.
  const vs = p.vaccinations ?? [];
  const tdThis = vs.filter((v) => v.vaccineCode === PREGNANCY_TD.td1.code && v.givenOn >= lmp).sort((a, b) => (a.givenOn < b.givenOn ? -1 : 1));
  const boosterThis = vs.find((v) => v.vaccineCode === PREGNANCY_TD.booster.code && v.givenOn >= lmp);
  const tdBefore = vs.filter((v) => v.vaccineCode === PREGNANCY_TD.td1.code && v.givenOn < lmp && v.givenOn >= addAge(lmp, { y: -PREGNANCY_TD.boosterIfTwoDosesWithinYears }));
  const tdRef = ref(UIP, PREGNANCY_TD.uncertain);
  const completeBy = week(PREGNANCY_TD.completeByWeek);
  if (tdBefore.length >= 2 && tdThis.length === 0) {
    const t = PREGNANCY_TD.booster;
    items.push({ id: 'uip:td_pregnancy_booster:1', category: 'vaccine', code: t.code, label: t.label, dose: 1, status: windowStatus(asOf, { dueFrom: lmp, dueBy: completeBy, doneOn: boosterThis?.givenOn }), dueFrom: lmp, dueBy: completeBy, doneOn: boosterThis?.givenOn ?? null, reason: { code: t.reason, params: { label: t.label } }, guideline: tdRef });
  } else {
    const [td1, td2] = tdThis;
    const by1 = week(12);
    items.push({ id: 'uip:td_pregnancy:1', category: 'vaccine', code: PREGNANCY_TD.td1.code, label: PREGNANCY_TD.td1.label, dose: 1, status: windowStatus(asOf, { dueFrom: lmp, dueBy: by1, doneOn: td1?.givenOn }), dueFrom: lmp, dueBy: by1, doneOn: td1?.givenOn ?? null, reason: { code: 'vTdPregnancy', params: { label: 'Td-1' } }, guideline: tdRef });
    if (td1) {
      const from2 = addDays(td1.givenOn, PREGNANCY_TD.td2.minDaysAfterTd1);
      const by2 = maxDay(from2, completeBy)!;
      items.push({ id: 'uip:td_pregnancy:2', category: 'vaccine', code: PREGNANCY_TD.td2.code, label: PREGNANCY_TD.td2.label, dose: 2, status: windowStatus(asOf, { dueFrom: from2, dueBy: by2, doneOn: td2?.givenOn }), dueFrom: from2, dueBy: by2, doneOn: td2?.givenOn ?? null, reason: { code: 'vTdPregnancy', params: { label: 'Td-2' } }, guideline: tdRef });
    }
  }

  // Supplements: folic acid in the 1st trimester; IFA and calcium from 14 weeks for 180 days.
  if (ga < FOLIC_ACID_RULES.untilWeek) {
    items.push({ id: 'anc:folic', category: 'pregnancy', code: 'folicAcid', status: 'ongoing', dueFrom: lmp, dueBy: week(FOLIC_ACID_RULES.untilWeek), reason: { code: 'folicAcid' }, guideline: ref(ANC) });
  }
  const supplement = (id: string, code: string, fromWeek: number, days: number, g: GuidelineMeta): PlanItem => {
    const from = week(fromWeek);
    const until = addDays(from, days);
    return { id, category: 'pregnancy', code, status: asOf < from ? 'upcoming' : 'ongoing', dueFrom: from, dueBy: until, reason: { code, params: { until } }, guideline: ref(g) };
  };
  items.push(supplement('amb:ifa_pregnancy', 'ifaPregnancy', IFA_PREGNANCY.fromWeek, IFA_PREGNANCY.days, AMB));
  items.push(supplement('anc:calcium', 'calcium', CALCIUM_RULES.fromWeek, CALCIUM_RULES.days, CALCIUM));

  if (ga <= ALBENDAZOLE_PREGNANCY.byWeek) {
    const from = week(ALBENDAZOLE_PREGNANCY.fromWeek);
    items.push({ id: 'anc:albendazole', category: 'pregnancy', code: 'albendazolePregnancy', status: asOf < from ? 'upcoming' : 'due', dueFrom: from, dueBy: week(ALBENDAZOLE_PREGNANCY.byWeek), reason: { code: 'albendazolePregnancy' }, guideline: ref(AMB) });
  }

  const usg = screeningsOf(p, 'ultrasound', lmp)[0];
  {
    const dueFrom = week(ULTRASOUND_RULES.fromWeek);
    const dueBy = addDays(week(ULTRASOUND_RULES.byWeek), 6);
    items.push({ id: 'anc:ultrasound', category: 'pregnancy', code: 'ultrasound', status: windowStatus(asOf, { dueFrom, dueBy, doneOn: usg?.screenedOn }), dueFrom, dueBy, doneOn: usg?.screenedOn ?? null, reason: { code: 'ultrasound' }, guideline: ref(ANC, ULTRASOUND_RULES.uncertain) });
  }

  // Hb at ANC: anaemia follow-up handles abnormal results; here only "never tested in this pregnancy".
  const hbThis = screeningsOf(p, 'hb', lmp);
  if (hbThis.length === 0) {
    items.push({ id: 'anc:hb', category: 'pregnancy', code: 'hbTest', status: windowStatus(asOf, { dueFrom: lmp, dueBy: week(12) }), dueFrom: lmp, dueBy: week(12), reason: { code: 'hbPregnancy' }, guideline: ref(AMB) });
  }

  // PMSMA: the next 9th of the month during the 2nd and 3rd trimesters.
  if (ga >= PMSMA_RULES.fromWeek && ga <= PMSMA_RULES.toWeek) {
    const [y, m, d] = asOf.split('-').map(Number);
    const ninth = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-09`;
    const next = d <= PMSMA_RULES.dayOfMonth ? ninth(y, m) : m === 12 ? ninth(y + 1, 1) : ninth(y, m + 1);
    if (next <= edd) {
      items.push({ id: 'pmsma:next', category: 'pregnancy', code: 'pmsma', status: next === asOf ? 'due' : 'upcoming', dueFrom: next, dueBy: next, reason: { code: 'pmsma' }, guideline: ref(PMSMA, PMSMA_RULES.uncertain) });
    }
  }

  const bfrom = week(BIRTH_PLAN_RULES.fromWeek);
  items.push({ id: 'anc:birth_plan', category: 'pregnancy', code: 'birthPlan', status: asOf < bfrom ? 'upcoming' : 'due', dueFrom: bfrom, dueBy: week(BIRTH_PLAN_RULES.byWeek), reason: { code: 'birthPlan', params: { edd } }, guideline: ref(ANC, BIRTH_PLAN_RULES.uncertain) });

  // Flags: BP in pregnancy, high-risk pregnancy, danger signs.
  const bp = latest(screeningsOf(p, 'bp', lmp), (s) => s.screenedOn);
  const sys = num(bp?.value.systolic);
  const dia = num(bp?.value.diastolic);
  const highBp = sys !== null && dia !== null && (sys >= BP_PREGNANCY.systolic || dia >= BP_PREGNANCY.diastolic);
  if (highBp) {
    const severe = sys! >= BP_PREGNANCY.severeSystolic || dia! >= BP_PREGNANCY.severeDiastolic;
    flags.push({ code: severe ? 'pregnancyBpSevere' : 'pregnancyBpHigh', level: 'urgent', params: { systolic: sys!, diastolic: dia!, on: bp!.screenedOn }, guideline: ref(ANC) });
  }
  if (highBp || hasCondition(p, HIGH_RISK_CONDITIONS)) {
    flags.push({ code: 'highRiskPregnancy', level: 'warning', params: { edd }, guideline: ref(ANC) });
  }
  flags.push({ code: 'dangerSigns', level: 'info', guideline: ref(ANC) });
  return items;
}

function postpartumItems(deliveredOn: string, asOf: string): PlanItem[] {
  const days = diffDays(asOf, deliveredOn);
  if (days < 0 || days > IFA_PREGNANCY.postpartumDays) return [];
  const until = addDays(deliveredOn, IFA_PREGNANCY.postpartumDays);
  return [
    { id: 'amb:ifa_postpartum', category: 'anaemia', code: 'ifaPostpartum', status: 'ongoing', dueFrom: deliveredOn, dueBy: until, reason: { code: 'ifaPostpartum', params: { until } }, guideline: ref(AMB) },
    { id: 'anc:calcium_postpartum', category: 'pregnancy', code: 'calciumPostpartum', status: 'ongoing', dueFrom: deliveredOn, dueBy: addDays(deliveredOn, CALCIUM_RULES.postpartumDays), reason: { code: 'calciumPostpartum', params: { until: addDays(deliveredOn, CALCIUM_RULES.postpartumDays) } }, guideline: ref(CALCIUM) },
  ];
}

// -------------------------------------------------------------- newborn/child

function childItems(p: PreventionPerson, dob: string, asOf: string, flags: PlanFlag[]): PlanItem[] {
  const items: PlanItem[] = [];
  const ageD = diffDays(asOf, dob);
  const ageM = ageMonths(dob, asOf);
  const sex = p.sex === 'male' || p.sex === 'female' ? p.sex : null;

  if (p.birthWeightKg != null && p.birthWeightKg < LOW_BIRTH_WEIGHT_KG && ageM < 12) {
    flags.push({ code: 'lowBirthWeight', level: 'warning', params: { kg: p.birthWeightKg }, guideline: ref(GROWTH) });
  }

  // HBNC home visits in the first 6 weeks.
  if (ageD <= 42 + HBNC_DAYS.matchToleranceDays) {
    const tol = HBNC_DAYS.matchToleranceDays;
    for (const day of HBNC_DAYS.days) {
      const on = addDays(dob, day);
      const visit = (p.homeVisits ?? []).find((v) => Math.abs(diffDays(v.slice(0, 10), on)) <= tol);
      const dueFrom = addDays(on, -tol);
      const dueBy = addDays(on, tol);
      items.push({ id: `hbnc:${day}`, category: 'newborn', code: 'hbnc', dose: day, status: windowStatus(asOf, { dueFrom, dueBy, doneOn: visit?.slice(0, 10) }), dueFrom, dueBy, doneOn: visit?.slice(0, 10) ?? null, reason: { code: 'hbnc', params: { day } }, guideline: ref(HBNC, HBNC_DAYS.uncertain) });
    }
  }

  // Weighings, with the birth weight as the first point.
  const weights: { on: string; kg: number }[] = (p.growth ?? [])
    .filter((g): g is GrowthMeasurement & { weightKg: number } => typeof g.weightKg === 'number' && g.weightKg > 0)
    .map((g) => ({ on: g.measuredOn, kg: g.weightKg }));
  if (p.birthWeightKg) weights.push({ on: dob, kg: p.birthWeightKg });
  weights.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));

  const interval = growthIntervalDays(ageM);
  if (interval !== null) {
    const measured = (p.growth ?? []).map((g) => g.measuredOn).sort();
    const last = measured[measured.length - 1] ?? null;
    const dueFrom = last ? addDays(last, interval) : dob;
    const dueBy = addDays(dueFrom, 14);
    const status: PlanStatus = last && asOf < dueFrom ? 'done' : windowStatus(asOf, { dueFrom, dueBy });
    items.push({ id: 'growth:check', category: 'child', code: 'growthCheck', status, dueFrom, dueBy, doneOn: status === 'done' ? last : null, reason: { code: interval === 30 ? 'growthMonthly' : 'growthQuarterly' }, guideline: ref(GROWTH, true) });
  }

  const lastW = weights[weights.length - 1];
  if (lastW && sex && ageM <= FALTER.maxAgeMonths) {
    const z = weightForAgeZ(lastW.kg, ageMonths(dob, lastW.on), sex);
    if (z !== null && z < Z_CUTOFFS.severe) flags.push({ code: 'severeUnderweight', level: 'urgent', params: { z, kg: lastW.kg }, guideline: ref(GROWTH, true) });
    else if (z !== null && z < Z_CUTOFFS.moderate) flags.push({ code: 'underweight', level: 'warning', params: { z, kg: lastW.kg }, guideline: ref(GROWTH, true) });
  }
  const lastH = latest((p.growth ?? []).filter((g) => typeof g.heightCm === 'number'), (g) => g.measuredOn);
  if (lastH && sex) {
    const z = heightForAgeZ(lastH.heightCm!, ageMonths(dob, lastH.measuredOn), sex);
    if (z !== null && z < Z_CUTOFFS.moderate) flags.push({ code: z < Z_CUTOFFS.severe ? 'severeStunting' : 'stunting', level: 'warning', params: { z, cm: lastH.heightCm! }, guideline: ref(GROWTH, true) });
  }
  const lastMuac = latest((p.growth ?? []).filter((g) => typeof g.muacCm === 'number'), (g) => g.measuredOn);
  if (lastMuac) {
    const mAge = ageMonths(dob, lastMuac.measuredOn);
    if (mAge >= MUAC.fromMonths && mAge < MUAC.toMonths + 1) {
      if (lastMuac.muacCm! < MUAC.samBelowCm) flags.push({ code: 'muacSam', level: 'urgent', params: { cm: lastMuac.muacCm! }, guideline: ref(GROWTH) });
      else if (lastMuac.muacCm! < MUAC.mamBelowCm) flags.push({ code: 'muacMam', level: 'warning', params: { cm: lastMuac.muacCm! }, guideline: ref(GROWTH) });
    }
  }

  // Faltering: no gain between the last two weighings far enough apart; a newborn not back to birth weight by day 14.
  if (weights.length >= 2 && ageM <= FALTER.maxAgeMonths) {
    const b = weights[weights.length - 1];
    const a = [...weights].reverse().find((w) => diffDays(b.on, w.on) >= FALTER.minGapDays);
    if (a && b.kg <= a.kg) flags.push({ code: 'growthFaltering', level: 'warning', params: { from: a.kg, to: b.kg, since: a.on }, guideline: ref(GROWTH, FALTER.uncertain) });
  }
  if (p.birthWeightKg && lastW && lastW.on !== dob && diffDays(lastW.on, dob) >= FALTER.newbornRegainByDay && diffDays(lastW.on, dob) <= 42 && lastW.kg < p.birthWeightKg) {
    flags.push({ code: 'birthWeightNotRegained', level: 'warning', params: { kg: lastW.kg, birthKg: p.birthWeightKg }, guideline: ref(GROWTH, FALTER.uncertain) });
  }

  // RBSK screening (6 weeks to 18 years).
  const years = ageYears(dob, asOf);
  if (ageD >= RBSK_SCREENING.anganwadi.fromWeeks * 7 && years < RBSK_SCREENING.school.toYears) {
    items.push({ id: 'rbsk:screen', category: 'child', code: 'rbsk', status: 'ongoing', dueFrom: null, dueBy: null, reason: { code: years < RBSK_SCREENING.anganwadi.toYears ? 'rbskAnganwadi' : 'rbskSchool' }, guideline: ref(RBSK) });
  }

  // Deworming on National Deworming Day (February and August).
  if (years >= DEWORMING.fromYears && years <= DEWORMING.toYears) {
    const y = Number(asOf.slice(0, 4));
    const next = [y, y + 1].flatMap((yy) => DEWORMING.months.map((mm) => `${yy}-${String(mm).padStart(2, '0')}-10`)).find((d) => d >= asOf)!;
    items.push({ id: 'amb:deworming', category: 'anaemia', code: 'deworming', status: 'ongoing', dueFrom: next, dueBy: null, reason: { code: years < DEWORMING.halfDoseUnderYears ? 'dewormingHalf' : 'dewormingFull', params: { next } }, guideline: ref(AMB) });
  }
  return items;
}

// ------------------------------------------------------------------- anaemia

export function anaemiaGroup(p: PreventionPerson, asOf: string, onDay = asOf): AnaemiaGroup | null {
  if (p.pregnancy?.lmp && p.pregnancy.lmp <= onDay && diffDays(onDay, p.pregnancy.lmp) <= 42 * 7) return 'pregnant';
  if (!p.dob) return null;
  const m = ageMonths(p.dob, onDay);
  if (m < 6) return null;
  if (m < 60) return 'child_6_59m';
  const y = ageYears(p.dob, onDay);
  if (y < 12) return 'child_5_11y';
  if (y < 15) return 'adolescent_12_14y';
  if (p.sex === 'female') return 'woman';
  if (p.sex === 'male') return 'man';
  return null;
}

export type AnaemiaSeverity = 'none' | 'mild' | 'moderate' | 'severe';

export function classifyHb(group: AnaemiaGroup, hb: number): AnaemiaSeverity {
  const t = HB_THRESHOLDS[group];
  if (hb >= t.anaemiaBelow) return 'none';
  if (hb >= t.moderateBelow) return 'mild';
  if (hb >= t.severeBelow) return 'moderate';
  return 'severe';
}

function anaemiaItems(p: PreventionPerson, asOf: string, flags: PlanFlag[]): PlanItem[] {
  const items: PlanItem[] = [];
  const last = latest(screeningsOf(p, 'hb'), (s) => s.screenedOn);
  const hb = num(last?.value.gdl);
  const group = last ? anaemiaGroup(p, asOf, last.screenedOn) : null;
  if (last && hb !== null && group) {
    const sev = classifyHb(group, hb);
    if (sev !== 'none') {
      const threshold = HB_THRESHOLDS[group].anaemiaBelow;
      flags.push({ code: sev === 'severe' ? 'anaemiaSevere' : 'anaemia', level: sev === 'severe' ? 'urgent' : 'warning', params: { hb, threshold, severity: sev, group, on: last.screenedOn }, guideline: ref(AMB) });
      const after = sev === 'severe' ? 0 : group === 'pregnant' ? RECHECK_DAYS.pregnantAny : sev === 'moderate' ? RECHECK_DAYS.moderate : RECHECK_DAYS.mild;
      const dueFrom = addDays(last.screenedOn, after);
      const dueBy = addDays(dueFrom, 14);
      const status = windowStatus(asOf, { dueFrom, dueBy });
      items.push({ id: 'amb:recheck', category: 'anaemia', code: 'anaemiaRecheck', status, dueFrom, dueBy, reason: { code: sev === 'severe' ? 'anaemiaRefer' : 'anaemiaRecheck', params: { hb, days: after } }, guideline: ref(AMB, RECHECK_DAYS.uncertain) });
      if (status === 'due' || status === 'overdue') flags.push({ code: 'anaemiaFollowUpDue', level: 'warning', params: { since: last.screenedOn }, guideline: ref(AMB, RECHECK_DAYS.uncertain) });
    }
  }

  // Prophylactic IFA for the person's group (pregnancy and postpartum are handled with ANC).
  if (p.dob && !(p.pregnancy?.lmp)) {
    const m = ageMonths(p.dob, asOf);
    const y = ageYears(p.dob, asOf);
    const postpartum = p.deliveredOn && diffDays(asOf, p.deliveredOn) <= IFA_PREGNANCY.postpartumDays;
    let regimen: IfaRegimen | null = null;
    if (m >= 6 && m < 60) regimen = 'ifa_syrup';
    else if (y >= 5 && y <= 9) regimen = 'ifa_pink';
    else if (y >= 10 && y <= 19) regimen = 'ifa_blue';
    else if (y >= 20 && y <= 49 && p.sex === 'female' && !postpartum) regimen = 'ifa_red_weekly';
    if (regimen) items.push({ id: `amb:${regimen}`, category: 'anaemia', code: regimen, status: 'ongoing', dueFrom: null, dueBy: null, reason: { code: regimen }, guideline: ref(AMB) });
  }
  return items;
}

// ------------------------------------------------------------------ NP-NCD

function ncdItems(p: PreventionPerson, dob: string, asOf: string, flags: PlanFlag[]): PlanItem[] {
  const items: PlanItem[] = [];
  const age = ageYears(dob, asOf);
  for (const r of SCREENINGS) {
    if (age < r.fromAge || (r.toAge !== null && age > r.toAge)) continue;
    if (r.sex === 'female' && p.sex !== 'female') continue;
    const g = ref(NPNCD, r.uncertain);
    if (hasCondition(p, r.skipIf)) {
      items.push({ id: `ncd:${r.kind}`, category: 'ncd', code: `${r.kind}FollowUp`, status: 'ongoing', dueFrom: null, dueBy: null, reason: { code: 'underCare' }, guideline: g });
      continue;
    }
    const last = latest(screeningsOf(p, r.kind as ScreeningKind), (s) => s.screenedOn);
    const dueFrom = last ? addAge(last.screenedOn, { y: r.everyYears }) : addAge(dob, { y: r.fromAge });
    const dueBy = addDays(dueFrom, GRACE_DAYS);
    const status: PlanStatus = last && asOf < dueFrom ? 'done' : windowStatus(asOf, { dueFrom, dueBy });
    items.push({ id: `ncd:${r.kind}`, category: r.kind === 'bp' || r.kind === 'sugar' ? 'ncd' : 'cancer', code: `${r.kind}Screen`, status, dueFrom, dueBy, doneOn: status === 'done' ? last!.screenedOn : null, reason: { code: `${r.kind}Screen`, params: { years: r.everyYears } }, guideline: g });
  }

  // Readings: outside pregnancy (pregnancy has its own BP rule).
  const pregnant = anaemiaGroup(p, asOf) === 'pregnant';
  const bp = latest(screeningsOf(p, 'bp'), (s) => s.screenedOn);
  const sys = num(bp?.value.systolic);
  const dia = num(bp?.value.diastolic);
  if (!pregnant && sys !== null && dia !== null && (sys >= BP_THRESHOLDS.systolic || dia >= BP_THRESHOLDS.diastolic)) {
    const urgent = sys >= BP_THRESHOLDS.urgentSystolic || dia >= BP_THRESHOLDS.urgentDiastolic;
    flags.push({ code: urgent ? 'bpVeryHigh' : 'bpHigh', level: urgent ? 'urgent' : 'warning', params: { systolic: sys, diastolic: dia, on: bp!.screenedOn }, guideline: ref(NPNCD, BP_THRESHOLDS.uncertain) });
  }
  const sugar = latest(screeningsOf(p, 'sugar'), (s) => s.screenedOn);
  const mg = num(sugar?.value.mgdl);
  if (sugar && mg !== null) {
    const fasting = sugar.value.fasting === true;
    if (mg >= (fasting ? SUGAR_THRESHOLDS.fastingMgdl : SUGAR_THRESHOLDS.randomMgdl)) {
      flags.push({ code: 'sugarHigh', level: 'warning', params: { mgdl: mg, on: sugar.screenedOn, fasting: fasting ? 1 : 0 }, guideline: ref(NPNCD, SUGAR_THRESHOLDS.uncertain) });
    }
  }
  for (const kind of ['oral', 'breast', 'cervical'] as const) {
    const s = latest(screeningsOf(p, kind), (x: ScreeningResult) => x.screenedOn);
    if (s && (s.value.result === 'abnormal' || s.value.result === 'referred')) {
      flags.push({ code: 'screenAbnormal', level: 'warning', params: { kind, on: s.screenedOn }, guideline: ref(NPNCD) });
    }
  }
  return items;
}

// --------------------------------------------------------------------- plan

export function preventionPlan(person: PreventionPerson, asOfInput: string | Date, opts: PlanOptions = {}): PreventionPlan {
  const asOf = toDay(asOfInput);
  const horizon = opts.horizonDays ?? 120;
  const dob = person.dob ? toDay(person.dob) : null;
  const items: PlanItem[] = [];
  const flags: PlanFlag[] = [];
  const lmp = person.pregnancy?.lmp ? toDay(person.pregnancy.lmp) : null;
  const ga = lmp ? Math.floor(diffDays(asOf, lmp) / 7) : null;
  const pregnant = lmp !== null && ga !== null && ga >= 0 && ga <= 42;

  if (dob && dob <= asOf) {
    const years = ageYears(dob, asOf);
    if (years < 18) items.push(...childVaccines(person, dob, asOf, horizon));
    if (years < 6) items.push(...childItems(person, dob, asOf, flags));
    else if (years < 19) items.push(...childItems(person, dob, asOf, flags).filter((i) => i.code === 'rbsk' || i.code === 'deworming'));
    items.push(...ncdItems(person, dob, asOf, flags));
  }
  if (pregnant) items.push(...pregnancyItems(person, lmp!, asOf, flags));
  else if (person.deliveredOn) items.push(...postpartumItems(toDay(person.deliveredOn), asOf));
  items.push(...anaemiaItems(person, asOf, flags));

  items.sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.dueFrom ?? '').localeCompare(b.dueFrom ?? '') || a.id.localeCompare(b.id));
  const LEVEL = { urgent: 0, warning: 1, info: 2 } as const;
  flags.sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);

  const used = new Set([...items.map((i) => i.guideline.id), ...flags.map((f) => f.guideline.id)]);
  return {
    asOf,
    ageDays: dob ? diffDays(asOf, dob) : null,
    gestationWeeks: pregnant ? ga : null,
    items,
    flags,
    guidelines: [...used].map((id) => guidelineById(id)).filter((g): g is GuidelineMeta => !!g),
  };
}

/** Items that need doing now (overdue first), for badges and reminders. */
export const actionable = (plan: PreventionPlan) => plan.items.filter((i) => i.status === 'overdue' || i.status === 'due');
