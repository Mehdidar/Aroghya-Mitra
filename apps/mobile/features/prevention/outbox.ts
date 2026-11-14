/**
 * Offline-first writes for preventive records: an AsyncStorage-persisted
 * queue flushed to POST /prevention/records (like features/shared/data/outbox.ts
 * does for /records/push). Network errors and 5xx stay queued for the next
 * try; a 4xx refusal is kept with its reason and not retried. Also caches the
 * last plan response per patient so the screens work offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { newUuid } from '@am/shared';

import { ApiError, apiJson } from '@/features/shared/services/api';
import { patientConfig } from '@/features/shared/services/config';

import type { PendingRecord, PlanResponse, RecordKind } from './types';

export type Sender = (item: PendingRecord) => Promise<void>;

/** Pure flush: returns the queue that remains. Order is kept; one failure does not block later items. */
export async function flushQueue(queue: PendingRecord[], send: Sender): Promise<{ remaining: PendingRecord[]; sent: number }> {
  const remaining: PendingRecord[] = [];
  let sent = 0;
  for (const item of queue) {
    if (item.rejected) {
      remaining.push(item);
      continue;
    }
    try {
      await send(item);
      sent++;
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        const body = e.body as { error?: string; reason?: string } | null;
        remaining.push({ ...item, tries: item.tries + 1, rejected: body?.error ?? body?.reason ?? `HTTP ${e.status}` });
      } else {
        remaining.push({ ...item, tries: item.tries + 1 });
      }
    }
  }
  return { remaining, sent };
}

export const httpSender: Sender = async (item) => {
  await apiJson('/prevention/records', { kind: item.kind, patientId: item.patientId, record: item.record }, { timeoutMs: 15_000 });
};

type State = {
  queue: PendingRecord[];
  cache: Record<string, PlanResponse & { fetchedAt: string }>;
  enqueue: (kind: RecordKind, patientId: string, record: Record<string, unknown>) => PendingRecord;
  flush: (send?: Sender) => Promise<number>;
  dismiss: (id: string) => void;
  remember: (patientId: string, res: PlanResponse) => void;
};

let flushing: Promise<number> | null = null;

export const usePreventionOutbox = create<State>()(
  persist(
    (set, get) => ({
      queue: [],
      cache: {},
      enqueue: (kind, patientId, record) => {
        const item: PendingRecord = { kind, patientId, record: { ...record, id: typeof record.id === 'string' ? record.id : newUuid() }, queuedAt: new Date().toISOString(), tries: 0 };
        set({ queue: [...get().queue, item] });
        void get().flush();
        return item;
      },
      flush: (send = httpSender) => {
        if (!patientConfig.apiUrl && send === httpSender) return Promise.resolve(0);
        if (!flushing) {
          flushing = (async () => {
            const snapshot = get().queue;
            const { remaining, sent } = await flushQueue(snapshot, send);
            // Keep anything queued while we were sending.
            const added = get().queue.filter((q) => !snapshot.includes(q));
            set({ queue: [...remaining, ...added] });
            return sent;
          })().finally(() => (flushing = null));
        }
        return flushing;
      },
      dismiss: (id) => set({ queue: get().queue.filter((q) => q.record.id !== id) }),
      remember: (patientId, res) => set({ cache: { ...get().cache, [patientId]: { ...res, fetchedAt: new Date().toISOString() } } }),
    }),
    {
      name: 'aroghya-prevention-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ queue, cache }) => ({ queue, cache }),
    },
  ),
);
