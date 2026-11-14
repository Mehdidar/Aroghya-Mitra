/**
 * The doctor's copilot data for one patient: the summary (with timeline and
 * lab comparison) from the server, and meanwhile — or offline — the same
 * deterministic summary built on this phone from the local records store
 * (no lab values and no AI narrative there: those live on the server).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildCopilotSummary, type CopilotSummary } from '@server/copilot/summary';

import { bundleFor } from '@/features/health/useHistory';
import { useRecords } from '@/features/shared/data/recordsStore';

import { fetchSummary, type Narrative } from './api';

export type SummarySource = 'server' | 'phone';

export function useCopilotSummary(patientId: string | undefined) {
  const patients = useRecords((s) => s.patients);
  const vitals = useRecords((s) => s.vitals);
  const prescriptions = useRecords((s) => s.prescriptions);
  const consultations = useRecords((s) => s.consultations);
  const referrals = useRecords((s) => s.referrals);
  const riskAlerts = useRecords((s) => s.riskAlerts);
  const reports = useRecords((s) => s.reports);
  const doseLogs = useRecords((s) => s.doseLogs);
  const local = useMemo(() => {
    if (!patientId) return null;
    const bundle = bundleFor(useRecords.getState(), patientId);
    return bundle ? buildCopilotSummary(bundle, null, { now: new Date() }) : null;
    // every slice is a dependency so the summary rebuilds when the record changes
  }, [patientId, patients, vitals, prescriptions, consultations, referrals, riskAlerts, reports, doseLogs]);

  const [remote, setRemote] = useState<CopilotSummary | null>(null);
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [narrativeState, setNarrativeState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!patientId) return;
    let alive = true;
    fetchSummary(patientId)
      .then((r) => alive && setRemote(r.summary))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [patientId, tick, consultations, prescriptions]);

  const requestNarrative = useCallback(async () => {
    if (!patientId) return;
    setNarrativeState('loading');
    try {
      const r = await fetchSummary(patientId, true);
      setRemote(r.summary);
      setNarrative(r.narrative);
      setNarrativeState('idle');
    } catch {
      setNarrativeState('error');
    }
  }, [patientId]);

  const summary = remote ?? local;
  const source: SummarySource = remote ? 'server' : 'phone';
  return { summary, source, narrative, narrativeState, requestNarrative, reload: () => setTick((n) => n + 1) };
}
