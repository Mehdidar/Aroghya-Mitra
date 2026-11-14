/**
 * Pure helpers for the ASHA's patient-message inbox (no React, no network): grouping messages into
 * per-patient threads, the urgent-first order, the "Today's plan" items and the visit-day choices.
 *
 * Ids: the server names patients by their records id (often a UUID); the phone's ASHA store may hold
 * the same person under a readable id. Matching always goes through toDbId (== sameRecord).
 */
import { toDbId } from '@am/shared';

import type { AshaMessage } from '../../ashaConnect/types';
import { followUpsDue, startOfDay } from '../logic/clinical';
import type { Patient, Visit } from '../types';

const DAY_MS = 86_400_000;
/** An urgent patient message stays on top for this long unless the ASHA answers it (or it is still unread). */
export const URGENT_WINDOW_MS = 3 * DAY_MS;

export interface Thread {
  /** Thread key (toDbId of the patient id). */
  key: string;
  /** The patient id as the server names it (use it for API calls). */
  patientId: string;
  /** The patient's record on this phone, if any. */
  patient?: Patient;
  /** Oldest first. */
  messages: AshaMessage[];
  last: AshaMessage;
  /** Patient messages the ASHA has not read. */
  unread: number;
  /** The latest emergency message the ASHA has not answered yet (null when none). */
  urgent: AshaMessage | null;
  /** Visit / call requests still waiting for her answer, most pressing first. */
  openRequests: AshaMessage[];
}

const byCreated = (a: AshaMessage, b: AshaMessage) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
const WHEN_RANK = { today: 0, tomorrow: 1, this_week: 2 } as const;

export const isRequest = (m: AshaMessage) => m.kind === 'visit_request' || m.kind === 'call_request';
export const isUnreadForAsha = (m: AshaMessage) => m.from === 'patient' && !m.readAt;

/** Finds the phone's record for a server patient id (exact id first, then the UUID form). */
export function findPatient(patients: Record<string, Patient>, id: string): Patient | undefined {
  if (patients[id]) return patients[id];
  const key = toDbId(id);
  return Object.values(patients).find((p) => toDbId(p.id) === key);
}

/** Merges fresh messages into a list (by id, newer updatedAt wins), oldest first. */
export function mergeMessages(current: readonly AshaMessage[], incoming: readonly AshaMessage[]): AshaMessage[] {
  const map = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) {
    const old = map.get(m.id);
    if (!old || m.updatedAt >= old.updatedAt) map.set(m.id, m);
  }
  return [...map.values()].sort(byCreated);
}

/**
 * The emergency message in a thread that still needs the ASHA: an urgent patient message written
 * after her last reply, that is unread or less than URGENT_WINDOW_MS old. A request she already
 * answered (accepted / done / declined) counts as answered.
 */
export function pendingUrgent(messages: readonly AshaMessage[], now: Date = new Date()): AshaMessage | null {
  let lastReply = '';
  for (const m of messages) if (m.from === 'asha' && m.createdAt > lastReply) lastReply = m.createdAt;
  let found: AshaMessage | null = null;
  for (const m of messages) {
    if (m.from !== 'patient' || !m.urgent || m.createdAt <= lastReply) continue;
    if (isRequest(m) && m.status && m.status !== 'open') continue;
    const fresh = now.getTime() - Date.parse(m.createdAt) < URGENT_WINDOW_MS;
    if (!fresh && m.readAt) continue;
    if (!found || m.createdAt > found.createdAt) found = m;
  }
  return found;
}

/** Most pressing request first: emergency, then the day asked for, then oldest. */
export const compareRequests = (a: AshaMessage, b: AshaMessage) =>
  Number(b.urgent) - Number(a.urgent) ||
  WHEN_RANK[a.visitWhen ?? 'this_week'] - WHEN_RANK[b.visitWhen ?? 'this_week'] ||
  a.createdAt.localeCompare(b.createdAt);

/** One thread per patient: urgent first (newest emergency first), then threads with open requests, then newest. */
export function groupThreads(messages: readonly AshaMessage[], patients: Record<string, Patient>, now: Date = new Date()): Thread[] {
  const groups = new Map<string, AshaMessage[]>();
  for (const m of messages) {
    const key = toDbId(m.patientId);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  const threads: Thread[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort(byCreated);
    const last = sorted[sorted.length - 1];
    threads.push({
      key,
      patientId: last.patientId,
      patient: findPatient(patients, last.patientId),
      messages: sorted,
      last,
      unread: sorted.filter(isUnreadForAsha).length,
      urgent: pendingUrgent(sorted, now),
      openRequests: sorted.filter((m) => isRequest(m) && m.status === 'open').sort(compareRequests),
    });
  }
  const group = (t: Thread) => (t.urgent ? 0 : t.openRequests.length ? 1 : 2);
  return threads.sort(
    (a, b) =>
      group(a) - group(b) ||
      (a.urgent && b.urgent ? b.urgent.createdAt.localeCompare(a.urgent.createdAt) : 0) ||
      b.last.createdAt.localeCompare(a.last.createdAt),
  );
}

export const totalUnread = (threads: readonly Thread[]) => threads.reduce((n, t) => n + t.unread, 0);

export type PlanItem =
  | { kind: 'urgent'; key: string; thread: Thread }
  | { kind: 'request'; key: string; thread: Thread; message: AshaMessage }
  | { kind: 'scheduled'; key: string; thread: Thread; message: AshaMessage; late: boolean }
  | { kind: 'followUp'; key: string; patientId: string; visit: Visit };

/**
 * "Today's plan": emergency messages, open visit / call requests, visits she accepted for today
 * (or earlier and not yet marked done), then follow-ups due from her own visit records.
 */
export function planItems(threads: readonly Thread[], visits: Iterable<Visit>, now: Date = new Date()): PlanItem[] {
  const items: PlanItem[] = [];
  const endOfToday = startOfDay(now).getTime() + DAY_MS;
  const today = startOfDay(now).getTime();
  for (const t of threads) if (t.urgent) items.push({ kind: 'urgent', key: `u:${t.key}`, thread: t });
  const requests = threads.flatMap((t) => t.openRequests.filter((m) => m.id !== t.urgent?.id).map((message) => ({ t, message })));
  requests.sort((a, b) => compareRequests(a.message, b.message));
  for (const { t, message } of requests) items.push({ kind: 'request', key: `r:${message.id}`, thread: t, message });
  const scheduled: { t: Thread; m: AshaMessage; late: boolean }[] = [];
  for (const t of threads) {
    for (const m of t.messages) {
      if (m.kind !== 'visit_request' || m.status !== 'accepted' || !m.scheduledFor) continue;
      const at = Date.parse(m.scheduledFor);
      if (Number.isNaN(at) || at >= endOfToday) continue;
      scheduled.push({ t, m, late: at < today });
    }
  }
  scheduled.sort((a, b) => a.m.scheduledFor!.localeCompare(b.m.scheduledFor!));
  for (const { t, m, late } of scheduled) items.push({ kind: 'scheduled', key: `s:${m.id}`, thread: t, message: m, late });
  for (const v of followUpsDue(visits, now)) items.push({ kind: 'followUp', key: `f:${v.id}`, patientId: v.patientId, visit: v });
  return items;
}

/** Days an ASHA can pick when accepting a visit: today and the next 7 days. Today = now; later days 10:00 local. */
export function visitDayOptions(now: Date = new Date(), days = 7): { offset: number; iso: string; date: Date }[] {
  const out: { offset: number; iso: string; date: Date }[] = [{ offset: 0, iso: now.toISOString(), date: now }];
  const base = startOfDay(now);
  for (let i = 1; i <= days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    d.setHours(10, 0, 0, 0);
    out.push({ offset: i, iso: d.toISOString(), date: d });
  }
  return out;
}

/** The offset (0 = today, 1 = tomorrow…) a visitWhen request suggests. */
export const suggestedOffset = (when: AshaMessage['visitWhen']) => (when === 'tomorrow' ? 1 : 0);

/** "fetal_movement_reduced" -> "Fetal movement reduced": for codes with no translated label. */
export function humanize(code: string): string {
  const s = code.replace(/[_-]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : code;
}
