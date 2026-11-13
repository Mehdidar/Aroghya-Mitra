import { parseStructured } from '../extractStructured.ts';
import { parseFrequency, type DoseSlot } from './frequency.ts';
import { ExtractedPrescription, type ExtractedMedicine } from './schema.ts';

/** Confidence given to a field when the model and the deterministic parser disagree. */
export const DISAGREEMENT_CONFIDENCE = 0.5;

/** Parse and validate model output for a prescription, then cross-check dose timings. */
export function parsePrescription(raw: string): ExtractedPrescription {
  const rx = parseStructured(raw, ExtractedPrescription);
  return { ...rx, medicines: rx.medicines.map(reconcileTimings) };
}

/**
 * The written frequency ("1-0-1", "BD") is the source of truth when we can parse it:
 * - model gave no timings → fill them from the frequency
 * - model timings disagree → use the frequency, lower confidence so the UI asks to confirm
 * - SOS / PRN → mark as needed
 */
export function reconcileTimings(med: ExtractedMedicine): ExtractedMedicine {
  const parsed = parseFrequency(med.frequencyRaw.value);
  if (!parsed) return med;
  const freqConf = med.frequencyRaw.confidence;
  const out: ExtractedMedicine = { ...med };

  if (parsed.asNeeded && med.asNeeded.value !== true) {
    out.asNeeded = { value: true, confidence: freqConf };
  }
  if (parsed.slots.length === 0) return out;

  const modelSlots = med.timings.value;
  if (!modelSlots) {
    out.timings = { value: parsed.slots, confidence: freqConf };
  } else if (!sameSlots(modelSlots, parsed.slots)) {
    out.timings = { value: parsed.slots, confidence: Math.min(freqConf, DISAGREEMENT_CONFIDENCE) };
  }
  return out;
}

function sameSlots(a: DoseSlot[], b: DoseSlot[]): boolean {
  return a.length === b.length && a.every((s) => b.includes(s));
}
