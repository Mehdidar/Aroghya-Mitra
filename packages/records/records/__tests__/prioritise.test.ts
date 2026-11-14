import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prioritiseReferrals, ruleIdOf } from '../prioritise.ts';
import type { Referral, RiskAlert } from '../types.ts';

const NOW = new Date('2026-11-14T10:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const ref = (id: string, patientId: string, createdHoursAgo: number, opts: Partial<Referral> = {}): Referral => ({
  id, patientId, fromAshaId: 'asha', toDoctorId: 'doc', toFacilityId: null, reason: 'Fever', riskAlertId: null,
  status: 'pending', createdAt: hoursAgo(createdHoursAgo), seenAt: null, acceptedAt: null, ...opts,
});
const alert = (patientId: string, ruleId: string, level: RiskAlert['level'], resolvedAt: string | null = null): RiskAlert => ({
  id: `${patientId}:${ruleId}:v1`, patientId, ashaWorkerId: 'asha', level, reason: ruleId, createdAt: hoursAgo(2), resolvedAt,
});

const RULE_SEVERITY = { preg_preeclampsia_signs: 'critical', preg_bp_high: 'high', gen_fever: 'medium', ncd_bp_high: 'medium', gen_spo2_low: 'high' } as const;

test('ruleIdOf reads the rule from an alert id', () => {
  assert.equal(ruleIdOf('p1:preg_bp_high:v9'), 'preg_bp_high');
  assert.equal(ruleIdOf('p1'), null);
  assert.equal(ruleIdOf(null), null);
});

test('severity from the rule table beats the stored record level; critical > high > medium', () => {
  const items = prioritiseReferrals({
    now: NOW,
    ruleSeverity: RULE_SEVERITY,
    referrals: [ref('r-med', 'p-med', 50), ref('r-high', 'p-high', 1), ref('r-crit', 'p-crit', 1)],
    // Both stored as 'high' in records; the rule table says one is critical.
    riskAlerts: [alert('p-med', 'gen_fever', 'medium'), alert('p-high', 'gen_spo2_low', 'high'), alert('p-crit', 'preg_preeclampsia_signs', 'high')],
  });
  assert.deepEqual(items.map((i) => i.referral.id), ['r-crit', 'r-high', 'r-med']);
  assert.equal(items[0].severity, 'critical');
  assert.equal(items[0].urgency, 'emergency');
  assert.equal(items[0].urgencySource, 'derived');
  assert.deepEqual(items[0].ruleIds, ['preg_preeclampsia_signs']);
  assert.equal(items[0].dangerSign, true, 'pre-eclampsia rule is a pregnancy + hypertension danger sign');
  assert.deepEqual(items.map((i) => i.rank), [1, 2, 3]);
  const why = items[0].reasons.find((r) => r.code === 'severity')!;
  assert.deepEqual(why.ruleIds, ['preg_preeclampsia_signs']);
});

test('given urgency ranks within the same severity; unknown rules fall back to the record level', () => {
  const items = prioritiseReferrals({
    now: NOW,
    ruleSeverity: RULE_SEVERITY,
    urgency: { 'r-a': 'routine', 'r-b': 'emergency' },
    referrals: [ref('r-a', 'pa', 30), ref('r-b', 'pb', 1)],
    riskAlerts: [alert('pa', 'not_a_rule', 'medium'), alert('pb', 'also_unknown', 'medium')],
  });
  assert.deepEqual(items.map((i) => i.referral.id), ['r-b', 'r-a']);
  assert.equal(items[0].severity, 'medium');
  assert.equal(items[0].urgencySource, 'referral');
  assert.deepEqual(items[0].ruleIds, [], 'unknown rule ids are not shown as reasons');
});

test('pregnancy + BP >= 140/90 in the referral is a danger sign and outranks a plain referral of the same severity', () => {
  const items = prioritiseReferrals({
    now: NOW,
    referrals: [
      ref('r-plain', 'p1', 40, { reason: 'Cough for two weeks' }),
      ref('r-preg', 'p2', 1, { reason: 'BP 150/100 at 34 weeks with headache' }),
    ],
    riskAlerts: [alert('p1', 'x', 'high'), alert('p2', 'y', 'high')],
  });
  assert.equal(items[0].referral.id, 'r-preg');
  const preg = items[0].reasons.find((r) => r.code === 'pregnancy_hypertension')!;
  assert.equal(preg.params.bp, '150/100');
  assert.equal(items[1].dangerSign, false);
});

test('BP is not a pregnancy danger sign for a patient who is not pregnant', () => {
  const [item] = prioritiseReferrals({ now: NOW, referrals: [ref('r', 'p', 1, { reason: 'BP 150/100, dizzy' })], riskAlerts: [] });
  assert.equal(item.dangerSign, false);
  assert.equal(item.severity, null);
  assert.equal(item.urgency, 'routine');
  // ...but it is when the record says she is pregnant.
  const [again] = prioritiseReferrals({ now: NOW, referrals: [ref('r', 'p', 1, { reason: 'BP 150/100, dizzy' })], riskAlerts: [], patients: { p: { chronicConditions: ['Gestational hypertension'] } } });
  assert.equal(again.dangerSign, true);
});

test('ties: unseen first, then the longest wait; closed referrals and resolved alerts are left out', () => {
  const items = prioritiseReferrals({
    now: NOW,
    referrals: [
      ref('r-new-recent', 'p1', 2),
      ref('r-new-old', 'p2', 30),
      ref('r-seen-old', 'p3', 60, { status: 'seen', seenAt: hoursAgo(50) }),
      ref('r-closed', 'p4', 90, { status: 'closed' }),
    ],
    riskAlerts: [alert('p1', 'x', 'high', hoursAgo(1))],
  });
  assert.deepEqual(items.map((i) => i.referral.id), ['r-new-old', 'r-new-recent', 'r-seen-old']);
  assert.equal(items[0].waitingHours, 30);
  assert.equal(items[1].severity, null, 'a resolved alert no longer raises the referral');
  assert.ok(items[0].reasons.some((r) => r.code === 'waiting' && r.params.hours === 30));
});

test('alert details (the ASHA phone keeps rule id and severity) are used when present', () => {
  const a: RiskAlert = { id: 'opaque-id', patientId: 'p', ashaWorkerId: 'asha', level: 'high', reason: '', createdAt: hoursAgo(1), resolvedAt: null };
  const [item] = prioritiseReferrals({ now: NOW, referrals: [ref('r', 'p', 1, { riskAlertId: 'opaque-id' })], riskAlerts: [a], alertDetails: { 'opaque-id': { ruleId: 'preg_bp_severe', severity: 'critical' } } });
  assert.equal(item.severity, 'critical');
  assert.deepEqual(item.ruleIds, ['preg_bp_severe']);
  assert.equal(item.dangerSign, true);
});

test('"fever for 2 weeks" does not make a patient pregnant', () => {
  const [item] = prioritiseReferrals({ now: NOW, referrals: [ref('r', 'p', 1, { reason: 'Fever for 2 weeks, BP 150/100' })], riskAlerts: [] });
  assert.equal(item.dangerSign, false);
});
