/**
 * The patient-records store: the app's local copy of prescriptions, dose
 * logs, reports, consultations, referrals and vitals for the demo patient,
 * shared by the patient, doctor and admin screens on one device.
 *
 * A doctor's new prescription goes in here and the patient's Reminders tab
 * reads it on the next render: that is the demo's "it appears on the
 * patient's phone" step without a network. When Supabase keys are present
 * the same actions can be mirrored to the tables in 1000_base.sql; nothing
 * here depends on that.
 *
 * Seeded from features/shared/seed/demoRecords.ts (Rekha Kumari) on first
 * launch. `reset()` reloads the seed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEMO_IDS, type Consultation, type DoseLog, type HealthReport, type Patient, type Prescription, type RecordReferral, type RecordRiskAlert, type VitalsReading } from '@am/shared';

import { buildDemoRecords } from '@/features/shared/seed/demoRecords';

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
  addPrescription: (p: Prescription, reminders?: ReminderPlanItem[]) => void;
  setReminders: (items: ReminderPlanItem[]) => void;
  logDose: (doseId: string, status: 'taken' | 'skipped', at?: Date) => void;
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
      addPrescription: (p, reminders = []) =>
        set((s) => ({ prescriptions: [p, ...s.prescriptions.filter((x) => x.id !== p.id)], reminders: [...reminders, ...s.reminders.filter((r) => r.prescriptionId !== p.id)] })),
      setReminders: (items) => set({ reminders: items }),
      logDose: (doseId, status, at = new Date()) =>
        set((s) => ({ doseActions: [...s.doseActions.filter((a) => a.doseId !== doseId), { doseId, status, at: at.toISOString() }] })),
      addReport: (r) => set((s) => ({ reports: [r, ...s.reports] })),
      addConsultation: (c) => set((s) => ({ consultations: [c, ...s.consultations] })),
      updateReferral: (id, patch) => set((s) => ({ referrals: s.referrals.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      addReferral: (r) => set((s) => ({ referrals: [r, ...s.referrals.filter((x) => x.id !== r.id)] })),
      addVitals: (v) => set((s) => ({ vitals: [v, ...s.vitals] })),
      addFoodLog: (e) => set((s) => ({ foodLog: [e, ...s.foodLog] })),
      setShareHistory: (on) => set({ shareHistory: on }),
      upsertPatient: (p) => set((s) => ({ patients: { ...s.patients, [p.id]: p } })),
    }),
    {
      name: 'aroghya-records-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ seedIfEmpty: _a, reset: _b, addPrescription: _c, setReminders: _d, logDose: _e, addReport: _f, addConsultation: _g, updateReferral: _h, addReferral: _i, addVitals: _j, addFoodLog: _k, setShareHistory: _l, upsertPatient: _m, ...data }) => data,
      onRehydrateStorage: () => (state) => {
        state?.seedIfEmpty();
      },
    },
  ),
);

/** The demo patient's record (the signed-in patient in demo mode). */
export const demoPatientId = DEMO_IDS.patientRecord;
