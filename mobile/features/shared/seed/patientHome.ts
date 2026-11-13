// Demo data for the patient Home (fictional Bengaluru patient). Phase A seed; P1 expands it in
// features/shared/seed with the SPEC §6 models.
export const demoPatientHome = {
  vitals: { heartRateBpm: 96, weightKg: 62 },
  reminders: [
    { id: 'r1', medicine: 'Metformin 500 mg', timingKey: 'afterBreakfast', time: '08:30', icon: 'medical' },
    { id: 'r2', medicine: 'Amlodipine 5 mg', timingKey: 'afterDinner', time: '21:00', icon: 'medical' },
    { id: 'r3', medicine: null, timingKey: 'checkup', time: null, icon: 'calendar' },
  ],
} as const;
