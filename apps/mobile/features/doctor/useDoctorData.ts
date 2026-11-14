import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { DEMO_IDS, DEMO_USERS } from '@am/shared';
import { buildDoctorDashboard, prioritiseReferrals, type PrioritisedItem } from '@am/records';

import { RULES } from '@/features/asha/logic/rules';

import { useRecords } from '@/features/shared/data/recordsStore';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';

import { pullDoctorInbox } from '@/features/shared/data/serverSync';

import { loadAshaBridge, mergeReferrals, type AshaBridgeData } from './ashaBridge';

/** Rule id → severity from the ASHA rule engine (the server re-runs the same rules on sync). */
const RULE_SEVERITY = Object.fromEntries(RULES.map((r) => [r.id, r.severity]));

/** Two columns on tablets and wide web windows. */
export function useColumns() {
  const { width } = useWindowDimensions();
  const t = useTheme();
  return { twoColumn: width > 700, contentWidth: Math.min(width, t.layout.maxContentWidth + (width > 700 ? 320 : 0)) };
}

export function useDoctorId() {
  const role = useSession((s) => s.role);
  return role === 'admin' ? DEMO_USERS.admin.id : DEMO_IDS.doctor;
}

/**
 * Referrals and alerts from the records store (which the server inbox feeds:
 * ASHA referrals synced from the field) merged with the ASHA module's store on
 * this device (the one-phone demo).
 */
export function useInbox(): { items: PrioritisedItem[]; loading: boolean; patientNames: Record<string, string>; reload: () => void } {
  const referrals = useRecords((s) => s.referrals);
  const riskAlerts = useRecords((s) => s.riskAlerts);
  const patients = useRecords((s) => s.patients);
  const [bridge, setBridge] = useState<AshaBridgeData | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    // Show this phone's copy at once; the server's referrals merge into the store when they arrive.
    void loadAshaBridge().then((b) => alive && setBridge(b));
    void pullDoctorInbox().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tick]);
  // Copilot feature C: ranked by the server-verified risk rules, urgency, pregnancy + hypertension signs and waiting time.
  const items = useMemo(
    () =>
      prioritiseReferrals({
        referrals: mergeReferrals(referrals, bridge?.referrals ?? []),
        riskAlerts: [...riskAlerts, ...(bridge?.alerts ?? []).filter((a) => !riskAlerts.some((r) => r.id === a.id))],
        now: new Date(),
        ruleSeverity: RULE_SEVERITY,
        alertDetails: bridge?.alertDetails,
        urgency: bridge?.urgency,
        patients: Object.fromEntries(Object.values(patients).map((p) => [p.id, { chronicConditions: p.chronicConditions }])),
      }),
    [referrals, riskAlerts, bridge, patients],
  );
  const patientNames = useMemo(
    () => ({ ...(bridge?.patientNames ?? {}), ...Object.fromEntries(Object.values(patients).map((p) => [p.id, p.fullName])) }),
    [bridge, patients],
  );
  return { items, loading: bridge === null, patientNames, reload: () => setTick((n) => n + 1) };
}

export function useDashboard() {
  const doctorId = useDoctorId();
  const consultations = useRecords((s) => s.consultations);
  const referrals = useRecords((s) => s.referrals);
  const riskAlerts = useRecords((s) => s.riskAlerts);
  return useMemo(() => buildDoctorDashboard({ doctorId, now: new Date(), consultations, accessLogs: [], referrals, riskAlerts }), [doctorId, consultations, referrals, riskAlerts]);
}

export function usePatientRecord(id: string | undefined) {
  const patient = useRecords((s) => (id ? s.patients[id] : undefined));
  const prescriptions = useRecords((s) => s.prescriptions);
  const consultations = useRecords((s) => s.consultations);
  const referrals = useRecords((s) => s.referrals);
  const riskAlerts = useRecords((s) => s.riskAlerts);
  const vitals = useRecords((s) => s.vitals);
  return useMemo(
    () => ({
      patient,
      prescriptions: prescriptions.filter((p) => p.patientId === id),
      consultations: consultations.filter((c) => c.patientId === id),
      referrals: referrals.filter((r) => r.patientId === id),
      riskAlerts: riskAlerts.filter((a) => a.patientId === id),
      vitals: vitals.filter((v) => v.patientId === id).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt)),
    }),
    [id, patient, prescriptions, consultations, referrals, riskAlerts, vitals],
  );
}
