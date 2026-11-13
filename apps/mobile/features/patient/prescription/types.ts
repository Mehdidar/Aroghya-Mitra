/** App-side mirror of server/ai/prescription/schema.ts (type-only import keeps Jest free of @server). */
import type { ExtractedMedicine, ExtractedPrescription } from '@server/ai/prescription/schema.ts';

export type { ExtractedMedicine, ExtractedPrescription };

export type Field<T> = { value: T | null; confidence: number };
export type DoseSlot = 'morning' | 'afternoon' | 'evening' | 'night';
export type MealRelation = 'before_food' | 'after_food' | 'with_food' | 'empty_stomach' | 'any';

/** Same threshold as server/ai/prescription/schema.ts CONFIRM_THRESHOLD. */
export const CONFIRM_THRESHOLD = 0.75;
export const ESSENTIAL_FIELDS = ['name', 'strength', 'dose', 'timings', 'durationDays'] as const;
export type EssentialField = (typeof ESSENTIAL_FIELDS)[number];

export function needsConfirmation(f: Field<unknown> | undefined): boolean {
  return !f || f.value === null || f.value === undefined || f.confidence < CONFIRM_THRESHOLD;
}

export function fieldsToConfirm(m: ExtractedMedicine): EssentialField[] {
  return ESSENTIAL_FIELDS.filter((k) => needsConfirmation(m[k] as Field<unknown>));
}

/** What the review screen edits: plain values plus which fields still need a pharmacist's eye. */
export interface ReviewedMedicine {
  key: string;
  name: string;
  genericName: string | null;
  strength: string;
  dose: string;
  slots: DoseSlot[];
  mealRelation: MealRelation | null;
  durationDays: number | null;
  asNeeded: boolean;
  instructions: string | null;
  /** Fields the model was unsure about; cleared once the user edits them. */
  unsure: EssentialField[];
}

export function toReviewed(m: ExtractedMedicine, i: number): ReviewedMedicine {
  return {
    key: `${i}`,
    name: m.name.value ?? '',
    genericName: m.genericName.value ?? null,
    strength: m.strength.value ?? '',
    dose: m.dose.value ?? '',
    slots: (m.timings.value ?? []) as DoseSlot[],
    mealRelation: (m.mealRelation.value as MealRelation | null) ?? null,
    durationDays: m.durationDays.value ?? null,
    asNeeded: m.asNeeded.value ?? false,
    instructions: m.instructions.value ?? null,
    unsure: fieldsToConfirm(m),
  };
}

export interface ExtractResponse {
  prescription: ExtractedPrescription;
  demo: boolean;
  reason?: string;
  model?: string;
}
