import { dobFromAge, lmpFromWeeks } from '../logic/clinical';
import { evaluateVisit, localizeAlert, urgencyFor } from '../logic/rules';
import type { Patient, Visit, Vitals } from '../types';

const NOW = new Date('2026-11-13T09:00:00.000Z');
const at = NOW.toISOString();

const pregnant = (weeks = 32): Patient => ({
  id: 'p1', name: 'A', sex: 'F', dob: dobFromAge(25, 0, NOW), village: 'X', categories: ['pregnant'],
  assignedAshaId: 'a1', pregnancy: { lmp: lmpFromWeeks(weeks, NOW) },
});
const newborn = (days = 10, birthWeightKg?: number): Patient => ({
  id: 'nb', name: 'B', sex: 'M', dob: new Date(NOW.getTime() - days * 86_400_000).toISOString(), village: 'X',
  categories: ['newborn'], assignedAshaId: 'a1', newborn: { birthWeightKg },
});
const adult = (age = 50, extra: Partial<Patient> = {}): Patient => ({
  id: 'ad', name: 'C', sex: 'M', dob: dobFromAge(age, 0, NOW), village: 'X', categories: ['ncd'], assignedAshaId: 'a1', ...extra,
});
const visit = (vitals: Omit<Vitals, 'recordedAt'>, status: Visit['status'] = 'completed'): Visit => ({
  id: 'v1', patientId: 'x', ashaId: 'a1', visitedAt: at, status, vitals: { recordedAt: at, ...vitals }, photos: [], source: 'manual', updatedAt: at,
});
const ids = (p: Patient, v: Visit) => evaluateVisit(p, v).map((a) => a.ruleId);

describe('pregnancy rules', () => {
  it('flags high BP as high and severe BP as critical, without duplicates', () => {
    expect(ids(pregnant(), visit({ systolic: 142, diastolic: 88 }))).toEqual(['preg_bp_high']);
    expect(ids(pregnant(), visit({ systolic: 165, diastolic: 112 }))).toEqual(['preg_bp_severe']);
  });

  it('escalates high BP plus headache to pre-eclampsia (critical)', () => {
    const alerts = evaluateVisit(pregnant(), visit({ systolic: 150, diastolic: 100, symptoms: ['severe_headache'] }));
    expect(alerts.map((a) => a.ruleId)).toEqual(['preg_preeclampsia_signs']);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].reason).toContain('150/100');
    expect(alerts[0].evidence.map((e) => e.field)).toEqual(['systolic', 'diastolic', 'symptoms']);
  });

  it('grades anaemia by Hb', () => {
    expect(ids(pregnant(), visit({ hemoglobin: 6.5 }))).toEqual(['preg_anaemia_severe']);
    expect(ids(pregnant(), visit({ hemoglobin: 8.9 }))).toEqual(['preg_anaemia_moderate']);
    expect(ids(pregnant(), visit({ hemoglobin: 11 }))).toEqual([]);
  });

  it('only checks fetal movement from 20 weeks', () => {
    expect(ids(pregnant(16), visit({ fetalMovement: 'absent' }))).toEqual([]);
    expect(ids(pregnant(30), visit({ fetalMovement: 'absent' }))).toEqual(['preg_fetal_movement_absent']);
  });

  it('uses pregnancy fever rule instead of general fever', () => {
    expect(ids(pregnant(), visit({ temperatureC: 38.5 }))).toEqual(['preg_fever']);
  });

  it('does not apply adult NCD BP rules to pregnancy', () => {
    expect(ids(pregnant(), visit({ systolic: 185, diastolic: 125 }))).not.toContain('ncd_bp_crisis');
  });

  it('flags post-dates pregnancy', () => {
    expect(ids(pregnant(41), visit({}))).toEqual(['preg_post_dates']);
  });
});

describe('newborn rules', () => {
  it('treats any IMNCI danger sign as critical', () => {
    const a = evaluateVisit(newborn(), visit({ symptoms: ['not_feeding', 'lethargy'] }));
    expect(a[0].ruleId).toBe('nb_danger_sign');
    expect(a[0].severity).toBe('critical');
  });
  it('fast breathing at 60/min', () => {
    expect(ids(newborn(), visit({ respRate: 59 }))).toEqual([]);
    expect(ids(newborn(), visit({ respRate: 60 }))).toEqual(['nb_fast_breathing']);
  });
  it('fever and hypothermia use infant thresholds, not adult ones', () => {
    expect(ids(newborn(), visit({ temperatureC: 37.6 }))).toEqual(['nb_fever']);
    expect(ids(newborn(), visit({ temperatureC: 35.0 }))).toEqual(['nb_hypothermia']);
  });
  it('low birth weight', () => {
    expect(ids(newborn(5, 1.3), visit({}))).toEqual(['nb_lbw_very']);
    expect(ids(newborn(5, 2.2), visit({}))).toEqual(['nb_lbw']);
    expect(ids(newborn(5, 3.0), visit({}))).toEqual([]);
  });
});

describe('general, NCD and TB rules', () => {
  it('hypertensive crisis supersedes raised BP', () => {
    expect(ids(adult(), visit({ systolic: 190, diastolic: 100 }))).toEqual(['ncd_bp_crisis']);
    expect(ids(adult(), visit({ systolic: 150, diastolic: 92 }))).toEqual(['ncd_bp_high']);
  });
  it('blood sugar bands', () => {
    expect(ids(adult(), visit({ bloodSugarRandom: 320 }))).toEqual(['ncd_sugar_very_high']);
    expect(ids(adult(), visit({ bloodSugarRandom: 220 }))).toEqual(['ncd_sugar_high']);
    expect(ids(adult(), visit({ bloodSugarFasting: 130 }))).toEqual(['ncd_sugar_high']);
    expect(ids(adult(), visit({ bloodSugarRandom: 60 }))).toEqual(['ncd_hypoglycemia']);
  });
  it('SpO2 bands', () => {
    expect(ids(adult(), visit({ spo2: 88 }))).toEqual(['gen_spo2_critical']);
    expect(ids(adult(), visit({ spo2: 92 }))).toEqual(['gen_spo2_low']);
  });
  it('presumptive TB from 2-week cough, not for patients already on treatment', () => {
    expect(ids(adult(), visit({ symptoms: ['cough_2_weeks'] }))).toEqual(['tb_presumptive']);
    expect(ids(adult(40, { conditions: ['tb_on_treatment'] }), visit({ symptoms: ['cough_2_weeks'] }))).toEqual([]);
    expect(ids(adult(), visit({ symptoms: ['cough_2_weeks', 'hemoptysis'] }))).toEqual(['tb_presumptive']);
  });
  it('chest pain with breathlessness is critical', () => {
    expect(ids(adult(), visit({ symptoms: ['chest_pain', 'breathlessness'] }))).toEqual(['gen_chest_pain_breathless']);
  });
  it('normal vitals produce no alerts', () => {
    expect(ids(adult(), visit({ systolic: 120, diastolic: 80, temperatureC: 36.8, pulse: 78, spo2: 98, bloodSugarRandom: 110 }))).toEqual([]);
  });
});

describe('alert shape', () => {
  it('has deterministic ids, sorts by severity, and renders Hindi', () => {
    const v = visit({ systolic: 150, diastolic: 95, hemoglobin: 6 });
    const a1 = evaluateVisit(pregnant(), v);
    const a2 = evaluateVisit(pregnant(), v);
    expect(a1.map((a) => a.id)).toEqual(a2.map((a) => a.id));
    expect(a1[0].id).toBe('p1:preg_anaemia_severe:v1');
    expect(a1.map((a) => a.severity)).toEqual(['critical', 'high']);
    expect(localizeAlert(a1[0], 'hi')).toContain('खून की कमी');
  });
  it('not-at-home visits never raise alerts', () => {
    expect(ids(pregnant(), visit({ systolic: 170, diastolic: 115 }, 'not_at_home'))).toEqual([]);
  });
  it('maps severity to referral urgency', () => {
    expect(urgencyFor(evaluateVisit(pregnant(), visit({ systolic: 170, diastolic: 115 })))).toBe('emergency');
    expect(urgencyFor(evaluateVisit(pregnant(), visit({ systolic: 145, diastolic: 85 })))).toBe('urgent');
    expect(urgencyFor([])).toBe('routine');
  });
});
