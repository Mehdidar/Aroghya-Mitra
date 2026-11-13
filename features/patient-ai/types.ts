/**
 * Types shared inside features/patient-ai. The literal values match the
 * server's prescription schema (server/ai/prescription/schema.ts).
 * TODO(P1): move to the shared types package once it exists.
 */
export type DoseSlot = 'morning' | 'afternoon' | 'evening' | 'night';
export const DOSE_SLOTS: readonly DoseSlot[] = ['morning', 'afternoon', 'evening', 'night'];

export type MealRelation = 'before_food' | 'after_food' | 'with_food' | 'empty_stomach' | 'any';
