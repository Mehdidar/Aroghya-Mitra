/**
 * Admin tools state: staff approvals and the facility's blood-bank stock,
 * persisted on the device. Patient→ASHA assignments live on the patient
 * row in the records store (upsertPatient).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEMO_FACILITY, DEMO_PROFILES, type Profile } from '@am/shared';
import { createBloodBankService, MockBloodBankProvider, type BloodBankService, type BloodComponent, type BloodGroup, type StockEntry } from '@am/records';

const EXTRA_STAFF: Profile[] = [
  { id: '22222222-2222-4222-8222-000000000011', role: 'asha', fullName: 'Geeta Rani', facilityId: DEMO_FACILITY.id, isActive: true },
  { id: '22222222-2222-4222-8222-000000000012', role: 'asha', fullName: 'Lakshmi Bai', facilityId: DEMO_FACILITY.id, isActive: false },
  { id: '22222222-2222-4222-8222-000000000013', role: 'doctor', fullName: 'Dr. Priya Nair', facilityId: DEMO_FACILITY.id, isActive: false },
];

export type AdminState = {
  staff: Profile[];
  /** Stock overrides for the facility bank, by `${group}|${component}`. */
  stock: Record<string, number>;
  setActive: (id: string, isActive: boolean) => void;
  setStock: (group: BloodGroup, component: BloodComponent, units: number) => void;
};

export const useAdmin = create<AdminState>()(
  persist(
    (set) => ({
      staff: [...DEMO_PROFILES.filter((p) => p.role !== 'patient'), ...EXTRA_STAFF],
      stock: {},
      setActive: (id, isActive) => set((s) => ({ staff: s.staff.map((p) => (p.id === id ? { ...p, isActive } : p)) })),
      setStock: (group, component, units) => set((s) => ({ stock: { ...s.stock, [`${group}|${component}`]: Math.max(0, Math.min(10000, Math.round(units))) } })),
    }),
    { name: 'aroghya-admin-v1', storage: createJSONStorage(() => AsyncStorage), partialize: ({ staff, stock }) => ({ staff, stock }) },
  ),
);

let service: BloodBankService | null = null;
export function bloodBankService(): BloodBankService {
  if (!service) service = createBloodBankService(new MockBloodBankProvider());
  return service;
}

/** The bank this facility's admin edits: the first mock bank (demo). */
export async function facilityBank() {
  const banks = await bloodBankService().search({}, new Date());
  return banks[0] ?? null;
}

export function applyOverrides(stock: StockEntry[], overrides: Record<string, number>): StockEntry[] {
  return stock.map((s) => {
    const o = overrides[`${s.bloodGroup}|${s.component}`];
    return o === undefined ? s : { ...s, units: o };
  });
}
