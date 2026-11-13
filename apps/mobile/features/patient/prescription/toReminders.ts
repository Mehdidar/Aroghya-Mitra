/** Reviewed medicines -> the Prescription record and reminder plan the store keeps. */
import type { Prescription, PrescriptionItem } from '@am/shared';

import type { ReminderPlanItem } from '@/features/shared/data/recordsStore';

import type { ReviewedMedicine } from './types';

const SLOT_LABEL: Record<ReviewedMedicine['slots'][number], string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };

export function frequencyLabel(m: ReviewedMedicine): string {
  if (m.asNeeded) return 'When needed';
  return m.slots.map((s) => SLOT_LABEL[s]).join(', ') || 'Once a day';
}

export function toPrescription(meds: ReviewedMedicine[], patientId: string, now = new Date(), id = `rx-scan-${now.getTime().toString(36)}`): Prescription {
  const items: PrescriptionItem[] = meds.map((m) => ({
    name: [m.name, m.strength].filter(Boolean).join(' '),
    dosage: m.dose || '1 dose',
    frequency: frequencyLabel(m),
    timesOfDay: m.slots,
    durationDays: m.durationDays,
    instructions: m.instructions,
  }));
  return { id, patientId, prescribedBy: null, source: 'scan', issuedAt: now.toISOString(), diagnosis: null, items, notes: 'Scanned from a paper prescription' };
}

export function toReminderItems(meds: ReviewedMedicine[], prescriptionId: string, now = new Date()): ReminderPlanItem[] {
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return meds
    .filter((m) => m.name.trim())
    .map((m, i) => ({
      id: `${prescriptionId}:${i}`,
      name: [m.name, m.strength].filter(Boolean).join(' '),
      dose: m.dose || null,
      slots: m.asNeeded ? [] : m.slots.length ? m.slots : ['morning'],
      mealRelation: m.mealRelation,
      startDate,
      durationDays: m.durationDays,
      asNeeded: m.asNeeded,
      prescriptionId,
    }));
}
