/**
 * The patient-records store: the app's local copy of prescriptions, dose
 * logs, reports, consultations, referrals and vitals for the demo patient,
 * shared by the patient, doctor and admin screens on one device.
 *
 * A doctor's new prescription goes in here and the patient's Reminders tab
 * reads it on the next render: that is the demo's "it appears on the
 * patient's phone" step on one device. Every write is also queued for the
 * server (outbox.ts → POST /records/push → Supabase), and serverSync.ts pulls
 * other phones' writes back in, so separate phones see each other's changes.
 * Offline, everything still works locally and is sent later.
 *
 * Seeded from features/shared/seed/demoRecords.ts (Rekha Kumari) on first
 * launch. `reset()` reloads the seed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEMO_IDS, type Consultation, type DoseLog, type HealthReport, type Patient, type Prescription, type RecordReferral, type RecordRiskAlert, type VitalsReading } from '@am/shared';

import { buildDemoRecords } from '@/features/shared/seed/demoRecords';

import { currentPatientId } from '@/features/shared/state/session';

import { queuePush } from './outbox';

export type ReminderPlanItem = {
  /** Matches packages/patient-ai ReminderMedicine so the Reminders tab can expand doses. */
  id: string;
  name: string;
  dose: string | null;
  slots: ('morning' | 'afternoon' | 'evening' | 'night')[];
  mealRelation: 'before_food' | 'after_food' | 'with_food' | 'empty_stomach' | 'any' | null;
  startDate: string;
  durationDays: number | null;
  asNeeded: boolean;
  paused?: boolean;
  prescriptionId: string | null;
};

export type DoseAction = { doseId: string; status: 'taken' | 'skipped'; at: string };

export type FoodLogEntry = { id: string; at: string; dish: string; grams: number; kcal: number; proteinG: number; carbsG: number; fatG: number };

export type RecordsState = {
  version: 2;
  seededAt: string | null;
  patients: Record<string, Patient>;
  vitals: VitalsReading[];
  prescriptions: Prescription[];
  doseLogs: DoseLog[];
  /** Taken / skipped taps keyed by packages/patient-ai dose id. */
  doseActions: DoseAction[];
  reminders: ReminderPlanItem[];
  reports: HealthReport[];
  consultations: Consultation[];
  referrals: RecordReferral[];
  riskAlerts: RecordRiskAlert[];
  foodLog: FoodLogEntry[];
  /** Patient's "Share history" toggle (QR card). */
  shareHistory: boolean;

  seedIfEmpty: () => void;
  reset: () => void;
  /** A real patient signed in: drop the demo seed; their own records come from the server. */
  startFresh: () => void;
  addPrescription: (p: Prescription, reminders?: ReminderPlanItem[]) => void;
  setReminders: (items: ReminderPlanItem[]) => void;
  /** `dose` (from the Reminders timeline) lets the server keep a dose log; without it the tap stays on this phone. */
  logDose: (doseId: string, status: 'taken' | 'skipped', at?: Date, dose?: { medicineId: string; medicineName: string; at: Date }) => void;
  addReport: (r: HealthReport) => void;
  addConsultation: (c: Consultation) => void;
  updateReferral: (id: string, patch: Partial<RecordReferral>) => void;
  addReferral: (r: RecordReferral) => void;
  addVitals: (v: VitalsReading) => void;
  addFoodLog: (e: FoodLogEntry) => void;
  setShareHistory: (on: boolean) => void;
  upsertPatient: (p: Patient) => void;
};

function seedState() {
  const d = buildDemoRecords();
  const reminders: ReminderPlanItem[] = d.prescriptions
    .filter((p) => p.source === 'doctor')
    .flatMap((p) =>
      p.items.map((it, i) => ({
        id: `${p.id}:${i}`,
        name: it.name,
        dose: it.dosage,
        slots: (it.timesOfDay ?? []).filter((s): s is ReminderPlanItem['slots'][number] => ['morning', 'afternoon', 'evening', 'night'].includes(s)),
        mealRelation: it.instructions?.toLowerCase().includes('after') ? ('after_food' as const) : null,
        startDate: p.issuedAt.slice(0, 10),
        durationDays: it.durationDays,
        asNeeded: false,
        prescriptionId: p.id,
      })),
    );
  return {
    seededAt: new Date().toISOString(),
    patients: { [d.patient.id]: d.patient },
    vitals: d.vitals,
    prescriptions: d.prescriptions,
    doseLogs: d.doseLogs,
    doseActions: [] as DoseAction[],
    reminders,
    reports: d.reports,
    consultations: d.consultations,
    referrals: d.referrals,
    riskAlerts: d.riskAlerts,
    foodLog: [] as FoodLogEntry[],
    shareHistory: true,
  };
}

export const useRecords = create<RecordsState>()(
  persist(
    (set, get) => ({
      version: 2,
      seededAt: null,
      patients: {},
      vitals: [],
      prescriptions: [],
      doseLogs: [],
      doseActions: [],
      reminders: [],
      reports: [],
      consultations: [],
      referrals: [],
      riskAlerts: [],
      foodLog: [],
      shareHistory: true,

      seedIfEmpty: () => {
        if (!get().seededAt) set(seedState());
      },
      reset: () => set(seedState()),
      startFresh: () =>
        set({ seededAt: new Date().toISOString(), patients: {}, vitals: [], prescriptions: [], doseLogs: [], doseActions: [], reminders: [], reports: [], consultations: [], referrals: [], riskAlerts: [], foodLog: [], shareHistory: false }),
      addPrescription: (p, reminders = []) => {
        set((s) => ({ prescriptions: [p, ...s.prescriptions.filter((x) => x.id !== p.id)], reminders: [...reminders, ...s.reminders.filter((r) => r.prescriptionId !== p.id)] }));
        queuePush({ prescriptions: [p] });
      },
      setReminders: (items) => set({ reminders: items }),
      logDose: (doseId, status, at = new Date(), dose) => {
        set((s) => ({ doseActions: [...s.doseActions.filter((a) => a.doseId !== doseId), { doseId, status, at: at.toISOString() }] }));
        if (dose) {
          const plan = get().reminders.find((r) => r.id === dose.medicineId);
          queuePush({
            doseLogs: [{ id: doseId, patientId: currentPatientId(), prescriptionId: plan?.prescriptionId ?? null, medicineName: dose.medicineName, scheduledAt: dose.at.toISOString(), status, takenAt: status === 'taken' ? at.toISOString() : null }],
          });
        }
      },
      addReport: (r) => {
        set((s) => ({ reports: [r, ...s.reports] }));
        queuePush({ reports: [r] });
      },
      addConsultation: (c) => {
        set((s) => ({ consultations: [c, ...s.consultations] }));
        queuePush({ consultations: [c] });
      },
      updateReferral: (id, patch) => {
        set((s) => ({ referrals: s.referrals.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
        queuePush({ referrals: [{ id, status: patch.status, seenAt: patch.seenAt, acceptedAt: patch.acceptedAt }] });
      },
      addReferral: (r) => {
        set((s) => ({ referrals: [r, ...s.referrals.filter((x) => x.id !== r.id)] }));
        // A referral the doctor first saw on the ASHA bridge: send the doctor's status change.
        if (r.status !== 'pending') queuePush({ referrals: [{ id: r.id, status: r.status, seenAt: r.seenAt, acceptedAt: r.acceptedAt }] });
      },
      addVitals: (v) => {
        set((s) => ({ vitals: [v, ...s.vitals] }));
        queuePush({ vitals: [v] });
      },
      addFoodLog: (e) => set((s) => ({ foodLog: [e, ...s.foodLog] })),
      setShareHistory: (on) => {
        set({ shareHistory: on });
        queuePush({ consent: { patientId: currentPatientId(), shareHistory: on } });
      },
      upsertPatient: (p) => set((s) => ({ patients: { ...s.patients, [p.id]: p } })),
    }),
    {
      name: 'aroghya-records-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ seedIfEmpty: _a, reset: _b, startFresh: _n, addPrescription: _c, setReminders: _d, logDose: _e, addReport: _f, addConsultation: _g, updateReferral: _h, addReferral: _i, addVitals: _j, addFoodLog: _k, setShareHistory: _l, upsertPatient: _m, ...data }) => data,
      onRehydrateStorage: () => (state) => {
        state?.seedIfEmpty();
      },
    },
  ),
);

/** The demo patient's record (Rekha). For the signed-in patient use currentPatientId(). */
export const demoPatientId = DEMO_IDS.patientRecord;
