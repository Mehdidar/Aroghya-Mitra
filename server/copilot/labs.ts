/**
 * Lab report comparison (doctor copilot, feature E). Pure, no I/O, no zod, so
 * the app can import it for display.
 *
 * A lab value is entered by a doctor from a report (lab_results, 5001). This
 * groups values per test, orders them over time, gives the change against the
 * previous value and flags values outside the reference range.
 *
 * Reference ranges here are DEFAULTS for adults, used only when the doctor
 * did not type the report's own range. They vary by laboratory, age, sex and
 * pregnancy: STATUS needs clinical review. Sources: WHO haemoglobin cut-offs
 * for anaemia (2011, pregnancy < 11 g/dL), ADA Standards of Care (glucose,
 * HbA1c), common Indian laboratory reference intervals.
 */
import type { LabResult } from '../records/repository.ts';

export interface LabTest {
  code: string;
  name: string;
  unit: string;
  /** Default adult reference range (see the note above). */
  low: number | null;
  high: number | null;
  /** In pregnancy, when it differs. */
  pregnancy?: { low: number | null; high: number | null };
  /** Values outside this are rejected as typing errors. */
  plausible: [number, number];
  /** Qualitative tests store a grade (0 = nil); `grades[value]` is what the report says. */
  grades?: string[];
  decimals: number;
}

export const URINE_GRADES = ['nil', 'trace', '1+', '2+', '3+', '4+'];

export const LAB_TESTS: LabTest[] = [
  { code: 'hb', name: 'Haemoglobin', unit: 'g/dL', low: 12, high: 15.5, pregnancy: { low: 11, high: null }, plausible: [2, 25], decimals: 1 },
  { code: 'urine_protein', name: 'Urine protein (dipstick)', unit: 'grade', low: null, high: 0, plausible: [0, 5], grades: URINE_GRADES, decimals: 0 },
  { code: 'urine_sugar', name: 'Urine sugar (dipstick)', unit: 'grade', low: null, high: 0, plausible: [0, 5], grades: URINE_GRADES, decimals: 0 },
  { code: 'fbs', name: 'Fasting blood sugar', unit: 'mg/dL', low: 70, high: 99, pregnancy: { low: 60, high: 91 }, plausible: [10, 1000], decimals: 0 },
  { code: 'ppbs', name: 'Post-prandial blood sugar (2 h)', unit: 'mg/dL', low: 70, high: 139, pregnancy: { low: 60, high: 152 }, plausible: [10, 1000], decimals: 0 },
  { code: 'rbs', name: 'Random blood sugar', unit: 'mg/dL', low: 70, high: 139, plausible: [10, 1000], decimals: 0 },
  { code: 'hba1c', name: 'HbA1c', unit: '%', low: 4, high: 5.6, plausible: [3, 20], decimals: 1 },
  { code: 'platelets', name: 'Platelet count', unit: '×10³/µL', low: 150, high: 450, plausible: [1, 2000], decimals: 0 },
  { code: 'wbc', name: 'Total leucocyte count', unit: '×10³/µL', low: 4, high: 11, plausible: [0.1, 200], decimals: 1 },
  { code: 'creatinine', name: 'Serum creatinine', unit: 'mg/dL', low: 0.5, high: 1.1, plausible: [0.1, 20], decimals: 2 },
  { code: 'urea', name: 'Blood urea', unit: 'mg/dL', low: 15, high: 40, plausible: [1, 400], decimals: 0 },
  { code: 'alt', name: 'ALT (SGPT)', unit: 'U/L', low: 7, high: 40, plausible: [1, 5000], decimals: 0 },
  { code: 'ast', name: 'AST (SGOT)', unit: 'U/L', low: 10, high: 40, plausible: [1, 5000], decimals: 0 },
  { code: 'bilirubin', name: 'Total bilirubin', unit: 'mg/dL', low: 0.3, high: 1.2, plausible: [0, 50], decimals: 1 },
  { code: 'tsh', name: 'TSH', unit: 'mIU/L', low: 0.4, high: 4.0, plausible: [0.001, 200], decimals: 2 },
  { code: 'cholesterol', name: 'Total cholesterol', unit: 'mg/dL', low: null, high: 199, plausible: [30, 1000], decimals: 0 },
];

export const labTest = (code: string) => LAB_TESTS.find((t) => t.code === code) ?? null;

/** "9.6", "trace", "1+". */
export function displayLabValue(code: string, value: number): string {
  const t = labTest(code);
  if (t?.grades) return t.grades[Math.round(value)] ?? String(value);
  return value.toFixed(t?.decimals ?? (Number.isInteger(value) ? 0 : 1));
}

export type LabFlag = 'low' | 'high' | 'normal' | 'unknown';

export function flagOf(value: number, low: number | null, high: number | null): LabFlag {
  if (low === null && high === null) return 'unknown';
  if (low !== null && value < low) return 'low';
  if (high !== null && value > high) return 'high';
  return 'normal';
}

export interface LabPoint {
  id: string;
  observedAt: string;
  value: number;
  display: string;
  flag: LabFlag;
  referenceLow: number | null;
  referenceHigh: number | null;
  reportId: string | null;
  source: LabResult['source'];
}

export interface LabSeries {
  testCode: string;
  testName: string;
  unit: string;
  points: LabPoint[];
  latest: LabPoint;
  previous: LabPoint | null;
  /** latest − previous, in the test's unit (grades for qualitative tests). */
  change: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'same' | null;
  /** The latest value is outside its reference range. */
  outOfRange: boolean;
  /** The latest value moved further out of range than the previous one (or newly out of range). */
  worsening: boolean;
  qualitative: boolean;
}

export interface LabComparison {
  series: LabSeries[];
  /** Tests whose latest value is out of range, worst-first order of `series`. */
  flagged: string[];
  count: number;
}

const distanceOut = (p: LabPoint) =>
  p.referenceLow !== null && p.value < p.referenceLow ? p.referenceLow - p.value : p.referenceHigh !== null && p.value > p.referenceHigh ? p.value - p.referenceHigh : 0;

export function compareLabs(results: LabResult[]): LabComparison {
  const byTest = new Map<string, LabResult[]>();
  for (const r of results) {
    if (!Number.isFinite(r.value)) continue;
    const rows = byTest.get(r.testCode) ?? [];
    rows.push(r);
    byTest.set(r.testCode, rows);
  }
  const series: LabSeries[] = [];
  for (const [code, rows] of byTest) {
    rows.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.createdAt.localeCompare(b.createdAt));
    const t = labTest(code);
    const points: LabPoint[] = rows.map((r) => ({
      id: r.id,
      observedAt: r.observedAt,
      value: r.value,
      display: displayLabValue(code, r.value),
      flag: flagOf(r.value, r.referenceLow, r.referenceHigh),
      referenceLow: r.referenceLow,
      referenceHigh: r.referenceHigh,
      reportId: r.reportId,
      source: r.source,
    }));
    const latest = points[points.length - 1]!;
    const previous = points.length > 1 ? points[points.length - 2]! : null;
    const change = previous ? round(latest.value - previous.value, 2) : null;
    const outOfRange = latest.flag === 'low' || latest.flag === 'high';
    series.push({
      testCode: code,
      testName: t?.name ?? rows[rows.length - 1]!.testName,
      unit: t?.unit ?? rows[rows.length - 1]!.unit,
      points,
      latest,
      previous,
      change,
      changePercent: previous && previous.value !== 0 && !t?.grades ? round(((latest.value - previous.value) / Math.abs(previous.value)) * 100, 1) : null,
      direction: change === null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'same',
      outOfRange,
      worsening: outOfRange && (!previous || distanceOut(latest) > distanceOut(previous)),
      qualitative: Boolean(t?.grades),
    });
  }
  series.sort((a, b) => Number(b.outOfRange) - Number(a.outOfRange) || Number(b.worsening) - Number(a.worsening) || a.testName.localeCompare(b.testName));
  return { series, flagged: series.filter((s) => s.outOfRange).map((s) => s.testCode), count: results.length };
}

/** "Haemoglobin 10.2 → 9.6 g/dL (low)": one line per test for the summary. */
export function labLine(s: LabSeries): string {
  const unit = s.qualitative ? '' : ` ${s.unit}`;
  const values = s.previous ? `${s.previous.display} → ${s.latest.display}` : s.latest.display;
  const flag = s.latest.flag === 'low' || s.latest.flag === 'high' ? ` (${s.latest.flag})` : '';
  return `${s.testName} ${values}${unit}${flag}`;
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
