/**
 * Referral inbox for doctors: patients referred by ASHA workers (P3).
 * Allowed transitions match the `p4_referrals_update` policy in 4002.
 */
import type { Referral, ReferralStatus, RiskAlert } from '../records/types.ts';

export type InboxAction = 'mark_seen' | 'accept' | 'close';

const NEXT: Record<InboxAction, ReferralStatus> = { mark_seen: 'seen', accept: 'accepted', close: 'closed' };

const ALLOWED_FROM: Record<InboxAction, ReferralStatus[]> = {
  mark_seen: ['pending'],
  accept: ['pending', 'seen'],
  close: ['accepted', 'seen'],
};

export function availableActions(r: Referral): InboxAction[] {
  return (Object.keys(ALLOWED_FROM) as InboxAction[]).filter((a) => ALLOWED_FROM[a].includes(r.status));
}

/** Returns the update to send, or null if the action is not allowed from the current status. */
export function applyAction(r: Referral, action: InboxAction, now: Date): Partial<Referral> | null {
  if (!ALLOWED_FROM[action].includes(r.status)) return null;
  const patch: Partial<Referral> = { status: NEXT[action] };
  if (action === 'mark_seen' || (action === 'accept' && r.seenAt === null)) patch.seenAt = now.toISOString();
  if (action === 'accept') patch.acceptedAt = now.toISOString();
  return patch;
}

export interface InboxItem {
  referral: Referral;
  riskLevel: RiskAlert['level'] | null;
  unread: boolean;
}

/** Open referrals: high-risk first, then unread, then oldest waiting first. */
export function buildInbox(referrals: Referral[], riskAlerts: RiskAlert[]): InboxItem[] {
  const level = new Map(riskAlerts.map((a) => [a.id, a.level]));
  return referrals
    .filter((r) => r.status !== 'closed')
    .map((r) => ({
      referral: r,
      riskLevel: r.riskAlertId ? (level.get(r.riskAlertId) ?? null) : null,
      unread: r.status === 'pending',
    }))
    .sort(
      (a, b) =>
        rank(b.riskLevel) - rank(a.riskLevel) ||
        Number(b.unread) - Number(a.unread) ||
        Date.parse(a.referral.createdAt) - Date.parse(b.referral.createdAt),
    );
}

function rank(level: RiskAlert['level'] | null): number {
  return level === 'high' ? 2 : level === 'medium' ? 1 : 0;
}
