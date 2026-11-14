import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, addMonths, ageYears } from './dates.ts';
import { anaemiaGroup, classifyHb, preventionPlan } from './engine.ts';
import { lmsZ, weightForAgeZ } from './growth.ts';
import { GUIDELINES } from './guidelines/index.ts';
import { HB_THRESHOLDS } from './guidelines/anaemia.ts';
import { demoPrevention } from './demo.ts';
import type { PreventionPerson, PreventionPlan } from './types.ts';

const TODAY = '2026-11-14';
const item = (p: PreventionPlan, id: string) => p.items.find((i) => i.id === id);
const flag = (p: PreventionPlan, code: string) => p.flags.find((f) => f.code === code);
const birthDoses = (dob: string) => [
  { vaccineCode: 'bcg', dose: 1, givenOn: dob },
  { vaccineCode: 'opv', dose: 0, givenOn: dob },
  { vaccineCode: 'hepb', dose: 0, givenOn: dob },
];

describe('dates', () => {
  it('adds months with clamping and counts whole years', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(ageYears('1996-11-15', '2026-11-14'), 29);
    assert.equal(ageYears('1996-11-14', '2026-11-14'), 30);
  });
});

describe('vaccines by age (UIP)', () => {
  it('a 7-week-old with birth doses is due the 6-week doses, and later doses are not shown yet', () => {
    const dob = addDays(TODAY, -49);
    const plan = preventionPlan({ dob, sex: 'female', vaccinations: birthDoses(dob) }, TODAY);
    for (const id of ['uip:penta:1', 'uip:opv:1', 'uip:rvv:1', 'uip:fipv:1', 'uip:pcv:1']) assert.equal(item(plan, id)?.status, 'due', id);
    assert.equal(item(plan, 'uip:penta:2'), undefined, 'Penta-2 waits for Penta-1');
    assert.equal(item(plan, 'uip:bcg:1')?.status, 'done');
    assert.equal(item(plan, 'uip:penta:1')?.guideline.id, 'in-mohfw-uip-nis');
    assert.ok(item(plan, 'uip:penta:1')?.guideline.version);
  });

  it('marks the 6-week doses overdue at 12 weeks and the birth Hep B dose missed after 24 hours', () => {
    const dob = addDays(TODAY, -84);
    const plan = preventionPlan({ dob, sex: 'male', vaccinations: [{ vaccineCode: 'bcg', dose: 1, givenOn: dob }] }, TODAY);
    assert.equal(item(plan, 'uip:penta:1')?.status, 'overdue');
    assert.equal(item(plan, 'uip:hepb:0')?.status, 'missed');
    assert.equal(item(plan, 'uip:opv:0')?.status, 'missed');
  });

  it('keeps 4 weeks between Penta doses even when the first was late', () => {
    const dob = addDays(TODAY, -80);
    const late = addDays(dob, 63); // Penta-1 at 9 weeks
    const plan = preventionPlan({ dob, sex: 'male', vaccinations: [...birthDoses(dob), { vaccineCode: 'penta', dose: 1, givenOn: late }] }, TODAY);
    const p2 = item(plan, 'uip:penta:2')!;
    assert.equal(p2.dueFrom, addDays(late, 28));
    assert.equal(p2.status, 'upcoming');
  });

  it('MR-1 is due at 9 months; JE only in endemic districts', () => {
    const dob = addMonths(TODAY, -9);
    const plan = preventionPlan({ dob, sex: 'female' }, TODAY);
    assert.equal(item(plan, 'uip:mr:1')?.status, 'due');
    assert.equal(item(plan, 'uip:je:1'), undefined);
    assert.equal(item(preventionPlan({ dob, sex: 'female', jeEndemic: true }, TODAY), 'uip:je:1')?.status, 'due');
  });

  it('a self-reported dose counts as done and says so', () => {
    const dob = addDays(TODAY, -20);
    const plan = preventionPlan({ dob, sex: 'female', vaccinations: [{ vaccineCode: 'bcg', dose: 1, givenOn: dob, source: 'self_reported' }] }, TODAY);
    assert.equal(item(plan, 'uip:bcg:1')?.status, 'done');
    assert.equal(item(plan, 'uip:bcg:1')?.reason.params?.selfReported, 1);
  });

  it('adults get no childhood vaccine items', () => {
    const plan = preventionPlan({ dob: '1990-01-01', sex: 'male' }, TODAY);
    assert.equal(plan.items.filter((i) => i.category === 'vaccine').length, 0);
  });
});

describe('ANC schedule by gestation weeks', () => {
  const woman = (weeks: number, extra: Partial<PreventionPerson> = {}): PreventionPerson => ({ dob: '2000-05-01', sex: 'female', pregnancy: { lmp: addDays(TODAY, -weeks * 7) }, ...extra });

  it('at 10 weeks the first visit, Td-1 and folic acid are due; the 2nd visit is upcoming', () => {
    const plan = preventionPlan(woman(10), TODAY);
    assert.equal(plan.gestationWeeks, 10);
    assert.equal(item(plan, 'anc:visit:1')?.status, 'due');
    assert.equal(item(plan, 'anc:visit:2')?.status, 'upcoming');
    assert.equal(item(plan, 'uip:td_pregnancy:1')?.status, 'due');
    assert.equal(item(plan, 'anc:folic')?.status, 'ongoing');
    assert.equal(item(plan, 'amb:ifa_pregnancy')?.status, 'upcoming');
    assert.equal(item(plan, 'anc:hb')?.status, 'due');
    assert.ok(flag(plan, 'dangerSigns'));
  });

  it('at 14 weeks with no visit the first visit is overdue; IFA and calcium have started', () => {
    const plan = preventionPlan(woman(14), TODAY);
    assert.equal(item(plan, 'anc:visit:1')?.status, 'overdue');
    assert.equal(item(plan, 'anc:visit:2')?.status, 'due');
    assert.equal(item(plan, 'amb:ifa_pregnancy')?.status, 'ongoing');
    assert.equal(item(plan, 'anc:calcium')?.status, 'ongoing');
    assert.equal(item(plan, 'pmsma:next')?.guideline.id, 'in-mohfw-pmsma');
  });

  it('at 30 weeks with two visits the 3rd visit is due; Td-2 four weeks after Td-1', () => {
    const lmp = addDays(TODAY, -30 * 7);
    const plan = preventionPlan(
      woman(30, {
        screenings: [
          { kind: 'anc', screenedOn: addDays(lmp, 70), value: {} },
          { kind: 'anc', screenedOn: addDays(lmp, 150), value: {} },
        ],
        vaccinations: [{ vaccineCode: 'td_pregnancy', dose: 1, givenOn: addDays(lmp, 70) }],
      }),
      TODAY,
    );
    assert.equal(item(plan, 'anc:visit:2')?.status, 'done');
    assert.equal(item(plan, 'anc:visit:3')?.status, 'due');
    assert.equal(item(plan, 'uip:td_pregnancy:2')?.dueFrom, addDays(lmp, 98));
    assert.equal(item(plan, 'uip:td_pregnancy:2')?.status, 'due');
  });

  it('two Td doses in a pregnancy within 3 years: one booster instead', () => {
    const plan = preventionPlan(woman(12, { vaccinations: [{ vaccineCode: 'td_pregnancy', dose: 1, givenOn: '2025-01-10' }, { vaccineCode: 'td_pregnancy', dose: 2, givenOn: '2025-02-10' }] }), TODAY);
    assert.equal(item(plan, 'uip:td_pregnancy_booster:1')?.status, 'due');
    assert.equal(item(plan, 'uip:td_pregnancy:1'), undefined);
  });

  it('BP 140/90 or more in pregnancy is urgent and makes the pregnancy high risk', () => {
    const plan = preventionPlan(woman(32, { screenings: [{ kind: 'bp', screenedOn: TODAY, value: { systolic: 142, diastolic: 92 } }] }), TODAY);
    assert.equal(flag(plan, 'pregnancyBpHigh')?.level, 'urgent');
    assert.ok(flag(plan, 'highRiskPregnancy'));
  });
});

describe('anaemia thresholds per group (Anemia Mukt Bharat)', () => {
  it('uses the AMB cut-offs', () => {
    assert.deepEqual(
      Object.fromEntries(Object.entries(HB_THRESHOLDS).map(([k, v]) => [k, v.anaemiaBelow])),
      { child_6_59m: 11, child_5_11y: 11.5, adolescent_12_14y: 12, woman: 12, man: 13, pregnant: 11 },
    );
  });

  it('classifies by group at the boundaries', () => {
    assert.equal(classifyHb('pregnant', 11), 'none');
    assert.equal(classifyHb('pregnant', 10.9), 'mild');
    assert.equal(classifyHb('pregnant', 9.9), 'moderate');
    assert.equal(classifyHb('pregnant', 6.9), 'severe');
    assert.equal(classifyHb('woman', 11.9), 'mild');
    assert.equal(classifyHb('woman', 12), 'none');
    assert.equal(classifyHb('man', 12.9), 'mild');
    assert.equal(classifyHb('man', 7.9), 'severe');
    assert.equal(classifyHb('child_6_59m', 10.5), 'mild');
    assert.equal(classifyHb('child_5_11y', 11.4), 'mild');
  });

  it('picks the group from age, sex and pregnancy', () => {
    assert.equal(anaemiaGroup({ dob: addDays(TODAY, -100), sex: 'male' }, TODAY), null);
    assert.equal(anaemiaGroup({ dob: addMonths(TODAY, -30), sex: 'male' }, TODAY), 'child_6_59m');
    assert.equal(anaemiaGroup({ dob: '2018-01-01', sex: 'male' }, TODAY), 'child_5_11y');
    assert.equal(anaemiaGroup({ dob: '2013-01-01', sex: 'female' }, TODAY), 'adolescent_12_14y');
    assert.equal(anaemiaGroup({ dob: '1990-01-01', sex: 'female' }, TODAY), 'woman');
    assert.equal(anaemiaGroup({ dob: '1990-01-01', sex: 'male' }, TODAY), 'man');
    assert.equal(anaemiaGroup({ dob: '1990-01-01', sex: 'female', pregnancy: { lmp: addDays(TODAY, -70) } }, TODAY), 'pregnant');
  });

  it('a man with Hb 12.5 is flagged and a recheck is scheduled; it becomes due later', () => {
    const p: PreventionPerson = { dob: '1980-01-01', sex: 'male', screenings: [{ kind: 'hb', screenedOn: '2026-11-01', value: { gdl: 12.5 } }] };
    const now = preventionPlan(p, TODAY);
    assert.equal(flag(now, 'anaemia')?.params?.severity, 'mild');
    assert.equal(item(now, 'amb:recheck')?.status, 'upcoming');
    const later = preventionPlan(p, '2027-02-05');
    assert.equal(item(later, 'amb:recheck')?.status, 'due');
    assert.ok(flag(later, 'anaemiaFollowUpDue'));
  });

  it('severe anaemia is urgent with an immediate referral', () => {
    const plan = preventionPlan({ dob: '1995-01-01', sex: 'female', screenings: [{ kind: 'hb', screenedOn: TODAY, value: { gdl: 6.5 } }] }, TODAY);
    assert.equal(flag(plan, 'anaemiaSevere')?.level, 'urgent');
    assert.equal(item(plan, 'amb:recheck')?.reason.code, 'anaemiaRefer');
    assert.equal(item(plan, 'amb:recheck')?.status, 'due');
  });
});

describe('growth z-scores and faltering (WHO standards)', () => {
  it('the LMS formula gives 0 at the median and handles L = 0', () => {
    assert.equal(lmsZ(10, { L: 0.5, M: 10, S: 0.1 }), 0);
    assert.ok(Math.abs(lmsZ(Math.exp(0.1), { L: 0, M: 1, S: 0.1 }) - 1) < 1e-9);
    assert.equal(weightForAgeZ(9.6479, 12, 'male'), 0);
    assert.ok(weightForAgeZ(7.0, 12, 'male')! < -2);
  });

  it('flags an underweight 1-year-old and growth faltering', () => {
    const dob = addMonths(TODAY, -12);
    const plan = preventionPlan(
      {
        dob,
        sex: 'male',
        growth: [
          { measuredOn: addDays(TODAY, -40), weightKg: 7.6 },
          { measuredOn: TODAY, weightKg: 7.5 },
        ],
      },
      TODAY,
    );
    assert.ok(flag(plan, 'underweight') || flag(plan, 'severeUnderweight'));
    assert.equal(flag(plan, 'growthFaltering')?.level, 'warning');
    assert.equal(flag(plan, 'growthFaltering')?.guideline.uncertain, true);
    assert.equal(item(plan, 'growth:check')?.status, 'done');
  });

  it('no faltering flag when the child gains weight', () => {
    const dob = addMonths(TODAY, -8);
    const plan = preventionPlan({ dob, sex: 'female', growth: [{ measuredOn: addDays(TODAY, -35), weightKg: 7.6 }, { measuredOn: TODAY, weightKg: 7.9 }] }, TODAY);
    assert.equal(flag(plan, 'growthFaltering'), undefined);
  });

  it('MUAC below 11.5 cm is SAM, below 12.5 is MAM', () => {
    const dob = addMonths(TODAY, -20);
    assert.equal(flag(preventionPlan({ dob, sex: 'female', growth: [{ measuredOn: TODAY, muacCm: 11.2 }] }, TODAY), 'muacSam')?.level, 'urgent');
    assert.equal(flag(preventionPlan({ dob, sex: 'female', growth: [{ measuredOn: TODAY, muacCm: 12.0 }] }, TODAY), 'muacMam')?.level, 'warning');
  });

  it('a 2.2 kg newborn: low birth weight flag and HBNC visits', () => {
    const baby = demoPrevention(TODAY)[1];
    const plan = preventionPlan(baby.person, TODAY);
    assert.ok(flag(plan, 'lowBirthWeight'));
    assert.equal(item(plan, 'hbnc:3')?.status, 'done');
    assert.equal(item(plan, 'hbnc:14')?.status, 'upcoming');
    assert.equal(item(plan, 'uip:bcg:1')?.status, 'done');
    assert.equal(item(plan, 'uip:penta:1')?.status, 'upcoming');
  });
});

describe('NCD screening by age and interval (NP-NCD)', () => {
  it('nothing before 30; at 30 a woman is due BP, sugar, oral, breast and cervical screening', () => {
    assert.equal(preventionPlan({ dob: '1997-01-01', sex: 'female' }, TODAY).items.filter((i) => i.id.startsWith('ncd:')).length, 0);
    const plan = preventionPlan({ dob: '1996-10-01', sex: 'female' }, TODAY);
    for (const k of ['bp', 'sugar', 'oral', 'breast', 'cervical']) assert.equal(item(plan, `ncd:${k}`)?.status, 'due', k);
  });

  it('men are not offered breast or cervical screening', () => {
    const plan = preventionPlan({ dob: '1980-01-01', sex: 'male' }, TODAY);
    assert.ok(item(plan, 'ncd:oral'));
    assert.equal(item(plan, 'ncd:breast'), undefined);
    assert.equal(item(plan, 'ncd:cervical'), undefined);
    assert.equal(item(plan, 'ncd:bp')?.status, 'overdue', 'never screened since turning 30');
  });

  it('BP yearly, cancers every 5 years', () => {
    const p: PreventionPerson = {
      dob: '1980-01-01',
      sex: 'female',
      screenings: [
        { kind: 'bp', screenedOn: '2026-03-01', value: { systolic: 120, diastolic: 80 } },
        { kind: 'oral', screenedOn: '2023-03-01', value: { result: 'normal' } },
      ],
    };
    const now = preventionPlan(p, TODAY);
    assert.equal(item(now, 'ncd:bp')?.status, 'done');
    assert.equal(item(now, 'ncd:bp')?.dueFrom, '2027-03-01');
    assert.equal(item(now, 'ncd:oral')?.status, 'done');
    assert.equal(item(preventionPlan(p, '2027-03-15'), 'ncd:bp')?.status, 'due');
    assert.equal(item(preventionPlan(p, '2028-04-01'), 'ncd:oral')?.status, 'due');
  });

  it('known hypertension means follow-up, not screening; readings above thresholds are flagged', () => {
    const plan = preventionPlan(
      { dob: '1960-01-01', sex: 'male', conditions: ['hypertension'], screenings: [{ kind: 'bp', screenedOn: TODAY, value: { systolic: 146, diastolic: 88 } }, { kind: 'sugar', screenedOn: TODAY, value: { mgdl: 238 } }] },
      TODAY,
    );
    assert.equal(item(plan, 'ncd:bp')?.code, 'bpFollowUp');
    assert.equal(flag(plan, 'bpHigh')?.level, 'warning');
    assert.ok(flag(plan, 'sugarHigh'));
    assert.equal(flag(preventionPlan({ dob: '1960-01-01', sex: 'male', screenings: [{ kind: 'sugar', screenedOn: TODAY, value: { mgdl: 120 } }] }, TODAY), 'sugarHigh'), undefined);
  });
});

describe('guidelines are versioned data awaiting clinical review', () => {
  it('every guideline has id, version, review date and no reviewer yet', () => {
    const ids = new Set<string>();
    for (const g of GUIDELINES) {
      assert.ok(g.id && g.title && g.issuer && g.document && g.version, g.id);
      assert.match(g.reviewDue, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(g.reviewedBy, null);
      assert.equal(g.status, 'needs_clinical_review');
      assert.ok(!ids.has(g.id));
      ids.add(g.id);
    }
  });

  it('the plan is deterministic and lists the guidelines it used', () => {
    const rekha = demoPrevention(TODAY)[0];
    const a = preventionPlan(rekha.person, TODAY);
    assert.deepEqual(a, preventionPlan(rekha.person, TODAY));
    assert.equal(a.gestationWeeks, 34);
    assert.ok(a.flags.some((f) => f.code === 'anaemia' && f.params?.hb === 9.6));
    assert.equal(item(a, 'uip:td_pregnancy:2')?.status, 'done');
    for (const i of a.items) assert.ok(a.guidelines.some((g) => g.id === i.guideline.id && g.version === i.guideline.version));
  });
});
