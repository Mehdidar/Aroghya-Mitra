/**
 * Generic medicine savings: Jan Aushadhi (PMBJP) equivalents for common
 * brand-name prescriptions, with the price difference.
 *
 * DEMO DATA. Prices are indicative MRPs seen in 2025-26 catalogues, rounded,
 * and must be refreshed from the PMBJP product list before any real use. The
 * screen that shows these must say "Ask your doctor or pharmacist before
 * switching" and label the numbers as demo.
 *
 * Matching is by salt + strength, after normalising the written name, so
 * "Glycomet 500" and "metformin 500 mg" both find metformin 500 mg.
 */

export interface GenericEquivalent {
  /** Salt and strength, e.g. "Metformin 500 mg". */
  generic: string;
  /** Typical pack the prices refer to. */
  pack: string;
  /** Indicative branded MRP for that pack, INR. */
  brandedInr: number;
  /** Jan Aushadhi price for the same pack, INR. */
  janAushadhiInr: number;
  /** Example brand names this generic replaces (for matching and display). */
  brands: string[];
}

export const JAN_AUSHADHI_DEMO: GenericEquivalent[] = [
  { generic: 'Metformin 500 mg', pack: '10 tablets', brandedInr: 28, janAushadhiInr: 6, brands: ['glycomet', 'glucophage', 'obimet', 'metformin'] },
  { generic: 'Metformin 1000 mg', pack: '10 tablets', brandedInr: 45, janAushadhiInr: 12, brands: ['glycomet 1000', 'metformin 1000'] },
  { generic: 'Amlodipine 5 mg', pack: '10 tablets', brandedInr: 32, janAushadhiInr: 4, brands: ['amlong', 'amlip', 'stamlo', 'norvasc', 'amlodipine'] },
  { generic: 'Atenolol 50 mg', pack: '14 tablets', brandedInr: 30, janAushadhiInr: 7, brands: ['tenormin', 'aten', 'atenolol'] },
  { generic: 'Labetalol 100 mg', pack: '10 tablets', brandedInr: 95, janAushadhiInr: 38, brands: ['labebet', 'lobet', 'labetalol'] },
  { generic: 'Telmisartan 40 mg', pack: '10 tablets', brandedInr: 85, janAushadhiInr: 15, brands: ['telma', 'telsar', 'telmikind', 'telmisartan'] },
  { generic: 'Atorvastatin 10 mg', pack: '10 tablets', brandedInr: 90, janAushadhiInr: 14, brands: ['atorva', 'lipitor', 'storvas', 'atorvastatin'] },
  { generic: 'Atorvastatin 20 mg', pack: '10 tablets', brandedInr: 150, janAushadhiInr: 24, brands: ['atorva 20', 'atorvastatin 20'] },
  { generic: 'Paracetamol 500 mg', pack: '10 tablets', brandedInr: 15, janAushadhiInr: 6, brands: ['crocin', 'dolo', 'calpol', 'paracetamol', 'pcm'] },
  { generic: 'Paracetamol 650 mg', pack: '10 tablets', brandedInr: 31, janAushadhiInr: 9, brands: ['dolo 650', 'calpol 650', 'paracetamol 650'] },
  { generic: 'Amoxicillin 500 mg', pack: '10 capsules', brandedInr: 85, janAushadhiInr: 30, brands: ['mox', 'novamox', 'amoxil', 'amoxicillin'] },
  { generic: 'Azithromycin 500 mg', pack: '3 tablets', brandedInr: 115, janAushadhiInr: 40, brands: ['azithral', 'zithrox', 'azee', 'azithromycin'] },
  { generic: 'Pantoprazole 40 mg', pack: '10 tablets', brandedInr: 120, janAushadhiInr: 18, brands: ['pan', 'pantocid', 'pantop', 'pantoprazole'] },
  { generic: 'Omeprazole 20 mg', pack: '10 capsules', brandedInr: 50, janAushadhiInr: 9, brands: ['omez', 'ocid', 'omeprazole'] },
  { generic: 'Cetirizine 10 mg', pack: '10 tablets', brandedInr: 25, janAushadhiInr: 4, brands: ['cetzine', 'alerid', 'okacet', 'cetirizine'] },
  { generic: 'Iron + folic acid', pack: '10 tablets', brandedInr: 60, janAushadhiInr: 9, brands: ['ifa', 'iron folic', 'ferrous sulphate', 'folvite', 'autrin', 'dexorange', 'iron + folic acid'] },
  { generic: 'Calcium 500 mg + vitamin D3', pack: '15 tablets', brandedInr: 110, janAushadhiInr: 30, brands: ['shelcal', 'calcium', 'gemcal', 'calcirol'] },
  { generic: 'Glimepiride 2 mg', pack: '10 tablets', brandedInr: 95, janAushadhiInr: 12, brands: ['amaryl', 'glimestar', 'zoryl', 'glimepiride'] },
  { generic: 'Losartan 50 mg', pack: '10 tablets', brandedInr: 70, janAushadhiInr: 14, brands: ['losar', 'repace', 'losartan'] },
  { generic: 'Levothyroxine 50 mcg', pack: '100 tablets', brandedInr: 140, janAushadhiInr: 60, brands: ['thyronorm', 'eltroxin', 'thyrox', 'levothyroxine'] },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function strengthOf(s: string, bareNumbersAreMg = false): string | null {
  const m = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml)\b/i.exec(s);
  if (m) return `${m[1]} ${m[2].toLowerCase()}`;
  // "Dolo 650", "Telma 40": a bare number after a medicine name is its strength in mg.
  const bare = bareNumbersAreMg ? /\b(\d+(?:\.\d+)?)\b/.exec(s) : null;
  return bare ? `${bare[1]} mg` : null;
}

export interface GenericMatch extends GenericEquivalent {
  savingInr: number;
  savingPercent: number;
}

/** Find the Jan Aushadhi equivalent for a prescribed medicine name (+ optional strength). */
export function findGeneric(name: string, strength?: string | null, table: GenericEquivalent[] = JAN_AUSHADHI_DEMO): GenericMatch | null {
  const text = norm(`${name} ${strength ?? ''}`);
  const wanted = strengthOf(text, true);
  let best: GenericEquivalent | null = null;
  for (const row of table) {
    const rowStrength = strengthOf(row.generic.toLowerCase());
    const brandHit = row.brands.some((b) => text.includes(norm(b)));
    const saltHit = text.includes(norm(row.generic.split(/\s+\d/)[0]));
    if (!brandHit && !saltHit) continue;
    // Prefer an exact strength match; accept a strength-less match only when the row has none either.
    if (wanted && rowStrength && wanted !== rowStrength) continue;
    if (!best || (wanted && rowStrength === wanted)) best = row;
  }
  if (!best) return null;
  const savingInr = Math.max(0, best.brandedInr - best.janAushadhiInr);
  return { ...best, savingInr, savingPercent: best.brandedInr ? Math.round((savingInr / best.brandedInr) * 100) : 0 };
}

/** Total indicative saving for a prescription, counting only medicines with a match. */
export function totalSaving(items: { name: string; strength?: string | null }[], table?: GenericEquivalent[]): { matched: number; savingInr: number } {
  let savingInr = 0;
  let matched = 0;
  for (const it of items) {
    const g = findGeneric(it.name, it.strength, table);
    if (g) {
      matched += 1;
      savingInr += g.savingInr;
    }
  }
  return { matched, savingInr };
}
