import { useCallback, useMemo, useState } from 'react';

import { allAcknowledged, checkPrescription, pregnancyFromRecord } from '@am/records';
import { DEMO_PROFILES, type Consultation, type Patient, type Prescription } from '@am/shared';
import { activeMedicines } from '@server/copilot/summary';

import type { MedicineDraft } from './prescriptions';

type PatientRec = { patient: Patient | undefined; referrals: { reason: string }[]; prescriptions: Prescription[]; consultations: Consultation[] };

/**
 * The prescription safety checks shared by the consultation and the
 * "Prescribe medicine" screens: the patient's current medicines, pregnancy
 * (read from the record, the doctor may correct it), and the allergy /
 * interaction / pregnancy warnings for the medicines being written. Saving
 * needs the doctor's "I have reviewed this" on every warning (`allReviewed`).
 */
export function usePrescriptionSafety(rec: PatientRec, meds: MedicineDraft[]) {
  const { patient, referrals, prescriptions, consultations } = rec;
  const [pregnantOverride, setPregnantOverride] = useState<boolean | null>(null);
  const [acked, setAcked] = useState<Set<string>>(new Set());

  const names = useMemo(() => new Map(DEMO_PROFILES.map((p) => [p.id, p.fullName])), []);
  const current = useMemo(() => activeMedicines(prescriptions, new Date(), names), [prescriptions, names]);
  const pregnancyFromRec = useMemo(
    () => pregnancyFromRecord(patient?.chronicConditions ?? [], [...referrals.map((r) => r.reason), ...consultations.flatMap((c) => [c.diagnosis ?? '', c.notes ?? ''])]),
    [patient, referrals, consultations],
  );
  const pregnant = pregnantOverride ?? pregnancyFromRec.pregnant;
  const filled = meds.filter((m) => m.name.trim());
  const warnings = useMemo(
    () => checkPrescription({ items: filled, allergies: patient?.allergies ?? [], pregnancy: { pregnant, weeks: pregnant ? pregnancyFromRec.weeks : null }, currentMedicines: current.map((m) => m.name) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filled.map((m) => m.name)), patient, pregnant, pregnancyFromRec.weeks, current],
  );
  const toggleAck = useCallback(
    (id: string) =>
      setAcked((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );

  return {
    current,
    pregnant,
    pregnancyWeeks: pregnancyFromRec.weeks,
    togglePregnant: () => setPregnantOverride(!pregnant),
    filled,
    warnings,
    acked,
    toggleAck,
    allReviewed: allAcknowledged(warnings, acked),
  };
}
