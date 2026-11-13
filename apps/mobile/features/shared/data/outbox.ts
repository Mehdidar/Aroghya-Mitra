/**
 * Outbox: local record changes waiting to reach the server (POST /records/push).
 *
 * Every write in the records store is applied locally first (so the app works
 * offline) and queued here. The queue is kept in AsyncStorage, deduplicated by
 * record id (the newest copy wins), and flushed when the server is reachable.
 * Rows the server refuses (a rule says no) are dropped, not retried forever;
 * network failures keep everything for the next try.
 *
 * Nothing is sent until `startOutbox()` is called (the app shell does that), so
 * unit tests and screens rendered in isolation never touch the network.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { Consultation, DoseLog, HealthReport, Prescription, RecordReferral, VitalsReading } from '@am/shared';

import { apiJson } from '@/features/shared/services/api';

export type ReferralUpdate = Pick<RecordReferral, 'id'> & Partial<Pick<RecordReferral, 'status' | 'seenAt' | 'acceptedAt'>>;

export interface PushBatch {
  prescriptions?: Prescription[];
  consultations?: Consultation[];
  doseLogs?: DoseLog[];
  vitals?: VitalsReading[];
  reports?: HealthReport[];
  referrals?: ReferralUpdate[];
  consent?: { patientId: string; shareHistory: boolean };
}

type ListKey = Exclude<keyof PushBatch, 'consent'>;
const LISTS: ListKey[] = ['prescriptions', 'consultations', 'doseLogs', 'vitals', 'reports', 'referrals'];
export const OUTBOX_KEY = 'aroghya-outbox-v1';

type PushResult = { ok: true; saved: Record<string, number>; rejected: { kind: string; id: string; reason: string }[] };

let pending: PushBatch = {};
let loaded = false;
let enabled = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<FlushOutcome> | null = null;
export type FlushOutcome = { sent: number; rejected: number; offline: boolean };
let lastOutcome: FlushOutcome | null = null;

/** What the "Synced 2 min ago" line shows. Updated by sends (here) and pulls (serverSync.ts). */
export const useSyncStatus = create<{ queued: number; lastSyncAt: number | null; offline: boolean }>(() => ({ queued: 0, lastSyncAt: null, offline: false }));
export const markSynced = () => useSyncStatus.setState({ lastSyncAt: Date.now(), offline: false });
export const markOffline = () => useSyncStatus.setState({ offline: true });

/** Merge `extra` into `base`: same id → the newer copy (referral updates are merged field by field). */
export function mergeBatch(base: PushBatch, extra: PushBatch): PushBatch {
  const out: PushBatch = { ...base };
  for (const k of LISTS) {
    const add = extra[k] as { id: string }[] | undefined;
    if (!add?.length) continue;
    const rows = new Map(((base[k] as { id: string }[] | undefined) ?? []).map((r) => [r.id, r]));
    for (const r of add) rows.set(r.id, k === 'referrals' ? { ...rows.get(r.id), ...r } : r);
    (out as Record<string, unknown>)[k] = [...rows.values()];
  }
  if (extra.consent) out.consent = extra.consent;
  return out;
}

export const batchSize = (b: PushBatch) => LISTS.reduce((n, k) => n + ((b[k] as unknown[] | undefined)?.length ?? 0), 0) + (b.consent ? 1 : 0);

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (raw) pending = mergeBatch(JSON.parse(raw) as PushBatch, pending);
  } catch {
    /* start empty */
  }
}

const save = () => AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(pending)).catch(() => undefined);

/** Queue records for the server. Safe to call from store actions; never throws. */
export function queuePush(batch: PushBatch) {
  pending = mergeBatch(pending, batch);
  useSyncStatus.setState({ queued: batchSize(pending) });
  void save();
  if (enabled) scheduleFlush();
}

function scheduleFlush(delayMs = 800) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushOutbox(), delayMs);
}

/** Send everything queued. Concurrent calls share one request. */
export function flushOutbox(): Promise<FlushOutcome> {
  if (!flushing) {
    flushing = (async (): Promise<FlushOutcome> => {
      await load();
      const batch = pending;
      const n = batchSize(batch);
      if (!n) return { sent: 0, rejected: 0, offline: false };
      try {
        const res = await apiJson<PushResult>('/records/push', batch, { timeoutMs: 15_000 });
        // Remove what was sent; anything queued meanwhile stays.
        pending = subtract(pending, batch);
        void save();
        return { sent: n - res.rejected.length, rejected: res.rejected.length, offline: false };
      } catch {
        if (enabled) scheduleFlush(30_000);
        return { sent: 0, rejected: 0, offline: true };
      }
    })().finally(() => {
      flushing = null;
    });
    void flushing.then((o) => {
      lastOutcome = o;
      useSyncStatus.setState({ queued: batchSize(pending) });
      if (o.offline) markOffline();
      else if (o.sent || o.rejected) markSynced();
    });
  }
  return flushing;
}

/** `base` minus the exact rows in `sent` (a row changed again since is kept). */
export function subtract(base: PushBatch, sent: PushBatch): PushBatch {
  const out: PushBatch = {};
  for (const k of LISTS) {
    const gone = new Set(((sent[k] as object[] | undefined) ?? []).map((r) => JSON.stringify(r)));
    const left = ((base[k] as object[] | undefined) ?? []).filter((r) => !gone.has(JSON.stringify(r)));
    if (left.length) (out as Record<string, unknown>)[k] = left;
  }
  if (base.consent && JSON.stringify(base.consent) !== JSON.stringify(sent.consent)) out.consent = base.consent;
  return out;
}

/** Turn on sending (the app shell calls this once). Flushes whatever was left from last time. */
export function startOutbox() {
  if (enabled) return;
  enabled = true;
  void load().then(() => batchSize(pending) && scheduleFlush(200));
}

/** True once the app shell has turned sync on. */
export const syncEnabled = () => enabled;

export const outboxStatus = () => ({ queued: batchSize(pending), last: lastOutcome });

/** Tests only. */
export function __resetOutbox() {
  pending = {};
  loaded = false;
  enabled = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
