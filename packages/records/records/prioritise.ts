/**
 * Referral prioritisation for the doctor's inbox (AI copilot, feature C).
 *
 * Pure and deterministic: no model is involved. Every referral is ranked by
 * the approved criteria, in this order:
 *
 *   1. Risk severity of the ASHA alerts behind it: critical > high > medium > low.
 *      The severity comes from the rule that fired (the rule id is part of the
 *      alert id, `${patientId}:${ruleId}:${visitId}`), looked up in the rule
 *      table the caller passes (`ruleSeverity`, from the ASHA rule engine the
 *      server re-runs on sync). When the rule is unknown the stored record level
 *      is used (high / medium).
 *   2. Urgency: emergency > urgent > routine (the ASHA referral's urgency when
 *      known, else derived from the severity exactly like the rule engine's
 *      `urgencyFor`: critical → emergency, high → urgent, else routine).
 *   3. Pregnancy + hypertension danger signs (pre-eclampsia rules, or a pregnant
 *      patient whose referral records BP ≥ 140/90).
 *   4. Not yet seen by a doctor.
 *   5. Waiting time: the longest-waiting referral first.
 *
 * Each ranked item carries the reasons (rule ids, values) so the card can show
 * WHY it is where it is. A screening aid for ordering the queue, not a triage
 * decision: the doctor reads every referral.
 */
import type { ReferralUrgency, Severity } from '../../shared/types.ts';
import type { InboxItem } from '../doctor/referrals.ts';
import type { Referral, RiskAlert } from './types.ts';

export const SEVERITY_ORDER: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
export const URGENCY_ORDER: Record<ReferralUrgency, number> = { routine: 1, urgent: 2, emergency: 3 };

/** ASHA rules that are pregnancy + hypertension danger signs (apps/mobile/features/asha/logic/rules.ts). */
export const PREGNANCY_HTN_RULES = ['preg_preeclampsia_signs', 'preg_bp_severe', 'preg_bp_high', 'preg_convulsions'] as const;

export type PriorityReasonCode = 'severity' | 'urgency' | 'pregnancy_hypertension' | 'unread' | 'waiting';

export interface PriorityReason {
  code: PriorityReasonCode;
  /** Rule ids behind this reason, when it comes from the rule engine. */
  ruleIds: string[];
  /** Values for the UI string: severity, urgency, hours, bp. */
  params: Record<string, string | number>;
  /** English, for logs and tests; the app renders its own translated text from code + params. */
  text: string;
}

export interface PrioritisedItem extends InboxItem {
  /** 1 = see first. */
  rank: number;
  severity: Severity | null;
  urgency: ReferralUrgency;
  /** Where the urgency came from. */
  urgencySource: 'referral' | 'derived';
  ruleIds: string[];
  dangerSign: boolean;
  waitingHours: number;
  reasons: PriorityReason[];
}

export interface AlertDetail {
  ruleId?: string;
  severity?: Severity;
}

export interface PatientContext {
  chronicConditions?: string[];
  /** True when the record says the patient is pregnant (ASHA category, ANC). */
  pregnant?: boolean;
}

export interface PrioritiseInput {
  referrals: Referral[];
  riskAlerts: RiskAlert[];
  now: Date;
  /** Rule id → severity, from the rule engine (RULES). */
  ruleSeverity?: Record<string, Severity>;
  /** Extra detail for alerts that still carry it (the ASHA phone's own alerts), by alert id. */
  alertDetails?: Record<string, AlertDetail>;
  /** The ASHA referral's urgency, by referral id, when known. */
  urgency?: Record<string, ReferralUrgency>;
  patients?: Record<string, PatientContext>;
}

/** `${patientId}:${ruleId}:${visitId}` → ruleId (null when the id has no rule part). */
export function ruleIdOf(alertId: string | null | undefined): string | null {
  if (!alertId) return null;
  const parts = alertId.split(':');
  return parts.length >= 2 && parts[1] ? parts[1] : null;
}

// "at 34 weeks", "28 weeks pregnant", "ANC": not "fever for 2 weeks".
const PREGNANT_RE = /\b(pregnan\w*|gestation\w*|antenatal|anc|(at|of)\s+\d{1,2}\s*(weeks?|wks?)\b|\d{1,2}\s*(weeks?|wks?)\s+(pregnan\w*|gestation))/i;
const HTN_RE = /\b(hypertension|htn|pre-?eclampsia|high\s+bp|high\s+blood\s+pressure)\b/i;
const BP_RE = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/;

function isPregnant(ctx: PatientContext | undefined, referral: Referral): boolean {
  if (ctx?.pregnant) return true;
  if ((ctx?.chronicConditions ?? []).some((c) => /pregnan|gestation|antenatal/i.test(c))) return true;
  return PREGNANT_RE.test(referral.reason);
}

function bpFrom(text: string): { s: number; d: number } | null {
  const m = BP_RE.exec(text);
  if (!m) return null;
  const s = Number(m[1]);
  const d = Number(m[2]);
  return s >= 60 && s <= 300 && d >= 30 && d <= 200 && s > d ? { s, d } : null;
}

const hoursBetween = (from: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(from)) / 3_600_000));

export function prioritiseReferrals(input: PrioritiseInput): PrioritisedItem[] {
  const { now } = input;
  const ruleSeverity = input.ruleSeverity ?? {};
  const alertsById = new Map(input.riskAlerts.map((a) => [a.id, a]));

  const items = input.referrals
    .filter((r) => r.status !== 'closed')
    .map((referral): Omit<PrioritisedItem, 'rank'> => {
      // The alerts behind this referral: the one it names, plus any open alert for the same patient.
      const linked = new Map<string, RiskAlert>();
      if (referral.riskAlertId && alertsById.has(referral.riskAlertId)) linked.set(referral.riskAlertId, alertsById.get(referral.riskAlertId)!);
      for (const a of input.riskAlerts) if (a.patientId === referral.patientId && a.resolvedAt === null) linked.set(a.id, a);

      const fired: { ruleId: string | null; severity: Severity }[] = [];
      for (const a of linked.values()) {
        const detail = input.alertDetails?.[a.id];
        const ruleId = detail?.ruleId ?? ruleIdOf(a.id);
        const sev: Severity = detail?.severity ?? (ruleId ? ruleSeverity[ruleId] : undefined) ?? (a.level === 'high' ? 'high' : 'medium');
        fired.push({ ruleId: ruleId && (ruleSeverity[ruleId] || detail?.ruleId) ? ruleId : null, severity: sev });
      }
      // The referral's own alert id can name a rule even when that alert row has not arrived yet.
      const ownRule = ruleIdOf(referral.riskAlertId);
      if (ownRule && ruleSeverity[ownRule] && !fired.some((f) => f.ruleId === ownRule)) fired.push({ ruleId: ownRule, severity: ruleSeverity[ownRule] });

      const severity = fired.reduce<Severity | null>((top, f) => (!top || SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[top] ? f.severity : top), null);
      const ruleIds = [...new Set(fired.map((f) => f.ruleId).filter((x): x is string => Boolean(x)))].sort();
      const topRules = [...new Set(fired.filter((f) => f.severity === severity && f.ruleId).map((f) => f.ruleId as string))].sort();

      const given = input.urgency?.[referral.id];
      const urgency: ReferralUrgency = given ?? (severity === 'critical' ? 'emergency' : severity === 'high' ? 'urgent' : 'routine');

      const pregRules = ruleIds.filter((id) => (PREGNANCY_HTN_RULES as readonly string[]).includes(id));
      const pregnant = isPregnant(input.patients?.[referral.patientId], referral);
      const bp = bpFrom(referral.reason);
      const bpDanger = pregnant && bp !== null && (bp.s >= 140 || bp.d >= 90);
      const htnText = pregnant && HTN_RE.test(referral.reason);
      const dangerSign = pregRules.length > 0 || bpDanger || htnText;

      const waitingHours = hoursBetween(referral.createdAt, now);
      const unread = referral.status === 'pending';
      const level = [...linked.values()].reduce<RiskAlert['level'] | null>((top, a) => (top === 'high' ? top : a.level), null);

      const reasons: PriorityReason[] = [];
      if (severity) {
        reasons.push({ code: 'severity', ruleIds: topRules, params: { severity }, text: `Risk ${severity}${topRules.length ? ` (${topRules.join(', ')})` : ''}` });
      }
      reasons.push({ code: 'urgency', ruleIds: [], params: { urgency, source: given ? 'referral' : 'derived' }, text: `Urgency ${urgency}${given ? '' : ' (from risk)'}` });
      if (dangerSign) {
        const p: Record<string, string | number> = {};
        if (bp) p.bp = `${bp.s}/${bp.d}`;
        reasons.push({ code: 'pregnancy_hypertension', ruleIds: pregRules, params: p, text: `Pregnancy with hypertension danger sign${bp ? ` (BP ${bp.s}/${bp.d})` : ''}${pregRules.length ? ` [${pregRules.join(', ')}]` : ''}` });
      }
      if (unread) reasons.push({ code: 'unread', ruleIds: [], params: {}, text: 'Not seen yet' });
      reasons.push({ code: 'waiting', ruleIds: [], params: { hours: waitingHours }, text: `Waiting ${waitingHours} h` });

      return { referral, riskLevel: level, unread, severity, urgency, urgencySource: given ? 'referral' : 'derived', ruleIds, dangerSign, waitingHours, reasons };
    });

  items.sort(
    (a, b) =>
      (b.severity ? SEVERITY_ORDER[b.severity] : 0) - (a.severity ? SEVERITY_ORDER[a.severity] : 0) ||
      URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency] ||
      Number(b.dangerSign) - Number(a.dangerSign) ||
      Number(b.unread) - Number(a.unread) ||
      Date.parse(a.referral.createdAt) - Date.parse(b.referral.createdAt) ||
      a.referral.id.localeCompare(b.referral.id),
  );
  return items.map((it, i) => ({ ...it, rank: i + 1 }));
}
