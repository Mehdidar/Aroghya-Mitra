/**
 * POST /copilot/labs body validation: a doctor types values from a report.
 * Strict: a known test must use its unit and a plausible value; a custom test
 * needs a name and unit. Qualitative tests accept the report's words ("nil",
 * "trace", "1+"). Nothing is guessed: an invalid row rejects the whole entry.
 */
import { z } from 'zod';

import type { LabResult } from '../records/repository.ts';
import { labTest, URINE_GRADES } from './labs.ts';

const Num = z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v), z.number().finite());
const OptNum = z.preprocess((v) => (v === '' || v === undefined ? null : v), Num.nullable());

const Row = z.object({
  testCode: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,40}$/, 'testCode: lower-case letters, digits, _'),
  testName: z.string().trim().min(1).max(120).optional(),
  value: z.union([Num, z.string().trim().min(1)]),
  unit: z.string().trim().min(1).max(30).optional(),
  referenceLow: OptNum.optional(),
  referenceHigh: OptNum.optional(),
});

export const LabEntryBody = z.object({
  patientId: z.string().trim().min(1),
  reportId: z.string().trim().min(1).nullable().optional(),
  /** YYYY-MM-DD (the report date) or a full ISO time. */
  observedAt: z.string().trim().refine((s) => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s) && !Number.isNaN(Date.parse(s)), 'observedAt: YYYY-MM-DD'),
  results: z.array(Row).min(1).max(30),
});

export type LabEntry = z.infer<typeof LabEntryBody>;

export type LabEntryResult = { ok: true; rows: LabResult[] } | { ok: false; errors: string[] };

export function validateLabEntry(body: unknown, ctx: { enteredBy: string; now: Date; newId: () => string; pregnant?: boolean }): LabEntryResult {
  const parsed = LabEntryBody.safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`) };
  const entry = parsed.data;
  const observedAt = /^\d{4}-\d{2}-\d{2}$/.test(entry.observedAt) ? `${entry.observedAt}T00:00:00.000Z` : new Date(entry.observedAt).toISOString();
  const errors: string[] = [];
  if (Date.parse(observedAt) > ctx.now.getTime() + 86_400_000) errors.push('observedAt: is in the future');
  if (Date.parse(observedAt) < Date.parse('1950-01-01')) errors.push('observedAt: too old');

  const rows: LabResult[] = [];
  entry.results.forEach((r, i) => {
    const at = `results.${i}`;
    const t = labTest(r.testCode);
    let value: number | null = null;
    if (typeof r.value === 'number') value = r.value;
    else if (t?.grades) {
      const g = (t.grades.indexOf(r.value.toLowerCase().replace(/^negative$|^absent$/, 'nil').replace(/^\+$/, '1+')));
      value = g >= 0 ? g : null;
      if (value === null) errors.push(`${at}.value: one of ${URINE_GRADES.join(', ')}`);
    } else errors.push(`${at}.value: a number`);
    if (value === null) return;

    if (t) {
      if (r.unit && r.unit !== t.unit) errors.push(`${at}.unit: ${t.name} is entered in ${t.unit}`);
      if (value < t.plausible[0] || value > t.plausible[1]) errors.push(`${at}.value: ${value} ${t.unit} is not a plausible ${t.name}; check the report`);
      if (t.grades && !Number.isInteger(value)) errors.push(`${at}.value: a grade`);
    } else {
      if (!r.testName) errors.push(`${at}.testName: required for a test not in the list`);
      if (!r.unit) errors.push(`${at}.unit: required for a test not in the list`);
    }
    const defaults = t ? (ctx.pregnant && t.pregnancy ? t.pregnancy : { low: t.low, high: t.high }) : { low: null, high: null };
    const low = r.referenceLow !== undefined ? r.referenceLow : defaults.low;
    const high = r.referenceHigh !== undefined ? r.referenceHigh : defaults.high;
    if (low !== null && high !== null && low > high) errors.push(`${at}: reference low is above reference high`);
    rows.push({
      id: ctx.newId(),
      patientId: entry.patientId,
      reportId: entry.reportId ?? null,
      testCode: r.testCode,
      testName: t?.name ?? r.testName ?? r.testCode,
      value,
      unit: t?.unit ?? r.unit ?? '',
      referenceLow: low,
      referenceHigh: high,
      observedAt,
      enteredBy: ctx.enteredBy,
      source: 'manual',
      createdAt: ctx.now.toISOString(),
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, rows };
}
