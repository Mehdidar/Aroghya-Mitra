/**
 * The plan for one patient, offline first: the cached server copy (or the
 * caller's local person) is shown at once, refreshed from the server when
 * reachable, and recomputed on the phone with any unsynced writes (the
 * engine is pure, so phone and server agree).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { preventionPlan, type PreventionPerson, type PreventionPlan } from '@am/patient-ai/prevention/index';

import { apiJson } from '@/features/shared/services/api';
import { patientConfig } from '@/features/shared/services/config';

import { usePreventionOutbox } from './outbox';
import { demoPersonFor, mergePersons, withPending } from './person';
import type { PlanResponse } from './types';

export type PlanSource = 'server' | 'cache' | 'device';

export interface PreventionView {
  loading: boolean;
  source: PlanSource;
  demo: boolean;
  person: PreventionPerson | null;
  plan: PreventionPlan | null;
  children: { patientId: string; name: string; plan: PreventionPlan }[];
  pending: number;
  rejected: { id: string; reason: string }[];
  refresh: () => Promise<void>;
}

export function usePreventionPlan(patientId: string | null | undefined, local?: PreventionPerson | null, now: Date = new Date()): PreventionView {
  const cache = usePreventionOutbox((s) => (patientId ? s.cache[patientId] : undefined));
  const queue = usePreventionOutbox((s) => s.queue);
  const remember = usePreventionOutbox((s) => s.remember);
  const flush = usePreventionOutbox((s) => s.flush);
  const [loading, setLoading] = useState(!!patientConfig.apiUrl);
  const [fresh, setFresh] = useState(false);
  const day = now.toISOString().slice(0, 10);

  /** One server round: send queued writes, then fetch and cache the plan. True when the server answered. */
  const load = useCallback(async (): Promise<boolean> => {
    if (!patientId || !patientConfig.apiUrl) return false;
    try {
      await flush();
      const res = await apiJson<PlanResponse>(`/prevention/${encodeURIComponent(patientId)}`, undefined, { timeoutMs: 12_000 });
      if (res?.ok) {
        remember(patientId, res);
        return true;
      }
    } catch {
      // Offline or refused: keep the cached / on-device plan.
    }
    return false;
  }, [patientId, flush, remember]);

  useEffect(() => {
    let alive = true;
    void load().then((ok) => {
      if (!alive) return;
      setLoading(false);
      if (ok) setFresh(true);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const ok = await load();
    setLoading(false);
    if (ok) setFresh(true);
  }, [load]);

  return useMemo(() => {
    const mine = patientId ? queue.filter((q) => q.patientId === patientId) : [];
    const base: PreventionPerson | null = cache?.person ?? (patientId ? demoPersonFor(patientId, new Date(day)) : null);
    const merged = local ? mergePersons(base, local) : base;
    const person = merged && patientId ? withPending(merged, patientId, queue) : merged;
    const plan = person ? preventionPlan(person, now) : null;
    return {
      loading,
      source: cache ? (fresh ? 'server' : 'cache') : 'device',
      demo: cache?.demo ?? (!!patientId && !!demoPersonFor(patientId)),
      person,
      plan,
      children: (cache?.children ?? []).map((c) => ({ patientId: c.patientId, name: c.name, plan: preventionPlan(withPending(c.person, c.patientId, queue), now) })),
      pending: mine.filter((q) => !q.rejected).length,
      rejected: mine.filter((q) => q.rejected).map((q) => ({ id: q.record.id, reason: q.rejected! })),
      refresh,
    };
    // `now` is a fresh Date each render; the plan only changes with the day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, queue, local, patientId, loading, fresh, day, refresh]);
}
