/**
 * The extraction shown when no vision model is configured or the call
 * failed. Plausible, clearly labelled as demo by the route, and carrying one
 * low-confidence field so the "Confirm with pharmacist" path is exercised.
 */
import type { ExtractedPrescription } from './schema.ts';

const f = <T>(value: T, confidence = 0.95) => ({ value, confidence });

export function demoExtraction(): ExtractedPrescription {
  return {
    isPrescription: true,
    legibility: 'partial',
    doctorName: f('Dr. A. Rao', 0.9),
    clinicName: f('PHC Hebbal', 0.85),
    date: f('2026-11-12', 0.8),
    patientName: f(null, 0.3),
    medicines: [
      {
        name: f('Labetalol'),
        genericName: f('Labetalol'),
        strength: f('100 mg'),
        form: f('tablet'),
        dose: f('1 tablet'),
        frequencyRaw: f('1-0-1'),
        timings: f(['morning', 'night']),
        mealRelation: f('after_food'),
        durationDays: f(30),
        asNeeded: f(false),
        instructions: f('After food'),
      },
      {
        name: f('Iron + Folic acid'),
        genericName: f('Ferrous sulphate + folic acid'),
        strength: f('100 mg + 500 mcg', 0.55), // handwriting unclear: must be confirmed
        form: f('tablet'),
        dose: f('1 tablet'),
        frequencyRaw: f('0-1-0'),
        timings: f(['afternoon']),
        mealRelation: f('after_food'),
        durationDays: f(90),
        asNeeded: f(false),
        instructions: f('Not with tea or coffee'),
      },
      {
        name: f('Calcium'),
        genericName: f('Calcium carbonate'),
        strength: f('500 mg'),
        form: f('tablet'),
        dose: f('1 tablet'),
        frequencyRaw: f('0-0-1'),
        timings: f(['night']),
        mealRelation: f('with_food'),
        durationDays: f(90),
        asNeeded: f(false),
        instructions: f(null, 0.5),
      },
    ],
    notes: 'Demo extraction: the photo was not read by a model.',
  };
}
