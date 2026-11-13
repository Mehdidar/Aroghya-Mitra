import type { Prescription, PrescriptionItem } from '@am/shared';

import type { ReminderPlanItem } from '@/features/shared/data/recordsStore';

export const SLOTS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type Slot = (typeof SLOTS)[number];

export type MedicineDraft = {
  name: string;
  dosage: string;
  frequency: string;
  timesOfDay: Slot[];
  durationDays: string;
  instructions: string;
};

export const emptyMedicine = (): MedicineDraft => ({ name: '', dosage: '1 tablet', frequency: '', timesOfDay: ['morning'], durationDays: '5', instructions: '' });

export function draftToItem(d: MedicineDraft): PrescriptionItem {
  const days = Number.parseInt(d.durationDays, 10);
  return {
    name: d.name.trim(),
    dosage: d.dosage.trim() || '1 tablet',
    frequency: d.frequency.trim() || `${d.timesOfDay.length}x a day`,
    timesOfDay: [...d.timesOfDay],
    durationDays: Number.isFinite(days) && days > 0 ? days : null,
    instructions: d.instructions.trim() || null,
  };
}

/** One reminder plan per medicine, starting today, so the patient's Reminders tab picks it up. */
export function remindersFor(p: Prescription, today = new Date()): ReminderPlanItem[] {
  const startDate = today.toISOString().slice(0, 10);
  return p.items.map((it, i) => ({
    id: `${p.id}:${i}`,
    name: it.name,
    dose: it.dosage,
    slots: (it.timesOfDay ?? []).filter((s): s is Slot => (SLOTS as readonly string[]).includes(s)),
    mealRelation: /after/i.test(it.instructions ?? '') ? 'after_food' : /before/i.test(it.instructions ?? '') ? 'before_food' : null,
    startDate,
    durationDays: it.durationDays,
    asNeeded: /when needed|sos/i.test(it.frequency),
    prescriptionId: p.id,
  }));
}

export function ageFrom(dateOfBirth: string | null, now = new Date()): number | null {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
