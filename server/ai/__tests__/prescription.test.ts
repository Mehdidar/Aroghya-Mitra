import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDurationDays, parseFrequency } from '../prescription/frequency';
import { parsePrescription, DISAGREEMENT_CONFIDENCE } from '../prescription/parse';
import { fieldsToConfirm, CONFIRM_THRESHOLD } from '../prescription/schema';
import { ExtractionError } from '../extractStructured';

const f = (value: unknown, confidence = 0.95) => ({ value, confidence });

function medicine(overrides: Record<string, unknown> = {}) {
  return {
    name: f('Dolo 650'),
    genericName: f('Paracetamol', 0.9),
    strength: f('650 mg'),
    form: f('Tab'),
    dose: f('1 tablet'),
    frequencyRaw: f('1-0-1'),
    timings: f(['morning', 'night']),
    mealRelation: f('after food'),
    durationDays: f('5 days'),
    asNeeded: f(false),
    instructions: f(null, 0),
    ...overrides,
  };
}

function rx(medicines: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    isPrescription: true,
    legibility: 'good',
    doctorName: f('Dr. A. Sharma'),
    clinicName: f(null, 0),
    date: f('12/11/2026'),
    patientName: f('R. Kumar', 0.6),
    medicines,
    notes: 'Review after 1 week',
    ...extra,
  });
}

describe('parseFrequency', () => {
  it('reads dash patterns', () => {
    assert.deepEqual(parseFrequency('1-0-1')?.slots, ['morning', 'night']);
    assert.deepEqual(parseFrequency('1-1-1')?.slots, ['morning', 'afternoon', 'night']);
    assert.deepEqual(parseFrequency('0-0-1')?.slots, ['night']);
    assert.deepEqual(parseFrequency('1-0-0-1')?.slots, ['morning', 'night']);
    assert.deepEqual(parseFrequency('½-0-½')?.amounts, [0.5, 0, 0.5]);
    assert.deepEqual(parseFrequency('1 – 0 – 1 x 5 days')?.slots, ['morning', 'night']);
  });

  it('reads abbreviations and words', () => {
    assert.equal(parseFrequency('BD')?.timesPerDay, 2);
    assert.equal(parseFrequency('Tab. TDS')?.timesPerDay, 3);
    assert.deepEqual(parseFrequency('HS')?.slots, ['night']);
    assert.equal(parseFrequency('SOS')?.asNeeded, true);
    assert.equal(parseFrequency('twice a day')?.timesPerDay, 2);
    assert.equal(parseFrequency('once weekly')?.everyNDays, 7);
  });

  it('returns null for unknown or empty input', () => {
    assert.equal(parseFrequency('as directed by physician maybe'), null);
    assert.equal(parseFrequency(''), null);
    assert.equal(parseFrequency('0-0-0'), null);
  });
});

describe('parseDurationDays', () => {
  it('reads common duration formats', () => {
    assert.equal(parseDurationDays('5 days'), 5);
    assert.equal(parseDurationDays('x 5d'), 5);
    assert.equal(parseDurationDays('2 weeks'), 14);
    assert.equal(parseDurationDays('1 month'), 30);
    assert.equal(parseDurationDays('5/7'), 5);
    assert.equal(parseDurationDays('1/52'), 7);
    assert.equal(parseDurationDays('1/12'), 30);
    assert.equal(parseDurationDays(10), 10);
    assert.equal(parseDurationDays('until review'), null);
    assert.equal(parseDurationDays(0), null);
  });
});

describe('parsePrescription', () => {
  it('normalises lenient model output', () => {
    const out = parsePrescription('Here is the JSON:\n```json\n' + rx([medicine()]) + '\n```');
    const m = out.medicines[0];
    assert.equal(out.isPrescription, true);
    assert.equal(m.form.value, 'tablet');
    assert.equal(m.mealRelation.value, 'after_food');
    assert.equal(m.durationDays.value, 5);
    assert.deepEqual(m.timings.value, ['morning', 'night']);
    assert.equal(m.timings.confidence, 0.95);
    assert.equal(out.notes, 'Review after 1 week');
  });

  it('accepts percentage and string confidences', () => {
    const out = parsePrescription(rx([medicine({ strength: { value: '650 mg', confidence: '80%' }, dose: { value: '1 tab', confidence: 70 } })]));
    assert.equal(out.medicines[0].strength.confidence, 0.8);
    assert.equal(out.medicines[0].dose.confidence, 0.7);
  });

  it('turns missing and unreadable fields into null with zero confidence', () => {
    const m = medicine({ genericName: undefined, durationDays: f('until review', 0.9), form: f('lozenge') });
    delete (m as Record<string, unknown>).genericName;
    const out = parsePrescription(rx([m])).medicines[0];
    assert.deepEqual(out.genericName, { value: null, confidence: 0 });
    assert.deepEqual(out.durationDays, { value: null, confidence: 0 });
    assert.equal(out.form.value, 'other');
  });

  it('fills missing timings from the written frequency', () => {
    const out = parsePrescription(rx([medicine({ frequencyRaw: f('1-1-1', 0.9), timings: f(null, 0) })])).medicines[0];
    assert.deepEqual(out.timings, { value: ['morning', 'afternoon', 'night'], confidence: 0.9 });
  });

  it('prefers the written frequency over model timings and lowers confidence when they disagree', () => {
    const out = parsePrescription(rx([medicine({ frequencyRaw: f('0-0-1'), timings: f(['morning']) })])).medicines[0];
    assert.deepEqual(out.timings.value, ['night']);
    assert.equal(out.timings.confidence, DISAGREEMENT_CONFIDENCE);
    assert.ok(fieldsToConfirm(out).includes('timings'));
  });

  it('marks SOS medicines as needed and does not ask for timings', () => {
    const out = parsePrescription(rx([medicine({ frequencyRaw: f('SOS'), timings: f(null, 0), durationDays: f(null, 0), asNeeded: f(null, 0) })])).medicines[0];
    assert.equal(out.asNeeded.value, true);
    assert.deepEqual(fieldsToConfirm(out), []);
  });

  it('flags essential fields below the threshold for the pharmacist', () => {
    const out = parsePrescription(rx([medicine({ strength: f('650 mg', CONFIRM_THRESHOLD - 0.01), dose: f(null, 0) })])).medicines[0];
    assert.deepEqual(fieldsToConfirm(out), ['strength', 'dose']);
  });

  it('dedupes and orders timings', () => {
    const out = parsePrescription(rx([medicine({ frequencyRaw: f(null, 0), timings: f(['night', 'Morning', 'night', 'bedtime']) })])).medicines[0];
    assert.deepEqual(out.timings.value, ['morning', 'night']);
  });

  it('handles a non-prescription image', () => {
    const out = parsePrescription(JSON.stringify({ isPrescription: false, legibility: 'poor', medicines: [] }));
    assert.equal(out.isPrescription, false);
    assert.equal(out.medicines.length, 0);
    assert.equal(out.doctorName.value, null);
  });

  it('throws ExtractionError with issues for invalid output', () => {
    assert.throws(() => parsePrescription('I cannot read this image.'), (e: unknown) => e instanceof ExtractionError && e.issues.length > 0);
    assert.throws(() => parsePrescription(JSON.stringify({ medicines: 'none' })), (e: unknown) => e instanceof ExtractionError && /isPrescription/.test(e.issues.join()));
  });
});
