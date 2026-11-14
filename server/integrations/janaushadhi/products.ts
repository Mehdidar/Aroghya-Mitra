/**
 * Parses the official PMBJP (Jan Aushadhi) "Product & MRP List" into rows.
 *
 * The list is published by PMBI on janaushadhi.gov.in ("Product Portfolio →
 * Product MRP List") and pmbi.co.in ("Product & MRP List"). Releases have used
 * columns like "Drug Code", "Generic Name" / "Name of the Product", "Unit Size",
 * "MRP", "Group Name", so columns are found by aliases. Rows with no name or no
 * usable MRP are skipped and counted, never guessed.
 *
 * The list carries Jan Aushadhi prices only. It has no branded prices, so it
 * cannot by itself produce the "you save ₹X" numbers in
 * packages/patient-ai/generics/janAushadhi.ts (see docs/INTEGRATIONS.md).
 */
import { parseCsv } from '../../bloodbanks/directory.ts';

export interface JanAushadhiProduct {
  /** PMBI drug code, e.g. "1" or "M0001", when the file has one. */
  drugCode: string | null;
  /** Generic name as printed, e.g. "Metformin Hydrochloride Tablets IP 500 mg". */
  name: string;
  /** Pack, e.g. "10's", "100 ml". */
  unitSize: string | null;
  /** Jan Aushadhi MRP for that pack, INR. */
  mrpInr: number;
  /** Therapeutic group, when present. */
  group: string | null;
  /** Strength found in the name, normalised ("500 mg"), or null. */
  strength: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/^﻿/, '').replace(/[^a-z0-9]/g, '');
const ALIASES: Record<string, string[]> = {
  drugCode: ['drugcode', 'code', 'productcode', 'itemcode'],
  name: ['genericname', 'nameoftheproduct', 'nameofproduct', 'productname', 'drugname', 'medicinename', 'name', 'genericnameofmedicine'],
  unitSize: ['unitsize', 'packsize', 'pack', 'unit', 'unitpack'],
  mrp: ['mrp', 'mrpinr', 'mrprs', 'mrpinrs', 'mrpinrupees', 'price', 'mrpperunit'],
  group: ['groupname', 'group', 'therapeuticgroup', 'category'],
};

export function productColumns(header: string[]): Record<string, number> {
  const h = header.map(norm);
  const out: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = h.findIndex((c) => names.includes(c));
    if (i >= 0) out[key] = i;
  }
  return out;
}

/** "₹ 12.50", "12.50/-", "Rs. 1,250.00" → number; null when not a positive amount. */
export function parseMrp(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').replace(/\/-\s*$/, '');
  const m = /(\d+(?:\.\d+)?)/.exec(cleaned);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function strengthOf(name: string): string | null {
  const m = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|iu|%)(?![a-z])/i.exec(name);
  if (!m) return null;
  const unit = m[2].toLowerCase() === 'µg' ? 'mcg' : m[2].toLowerCase();
  return `${m[1]} ${unit}`;
}

export interface ProductImport {
  products: JanAushadhiProduct[];
  skipped: { reason: string; count: number }[];
  missingColumns: string[];
}

/** Find the header row: the first row (within the first 20) that has a name and an MRP column; official exports often start with a title line. */
function findHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const c = productColumns(rows[i]);
    if (c.name !== undefined && c.mrp !== undefined) return i;
  }
  return 0;
}

export function productRows(text: string): ProductImport {
  const all = parseCsv(text);
  const at = findHeader(all);
  const header = all[at] ?? [];
  const data = all.slice(at + 1);
  const col = productColumns(header);
  const missingColumns = ['name', 'mrp'].filter((k) => col[k] === undefined);
  if (missingColumns.length) return { products: [], skipped: [], missingColumns };
  const skip = new Map<string, number>();
  const bump = (r: string) => skip.set(r, (skip.get(r) ?? 0) + 1);
  const get = (r: string[], k: string) => (col[k] !== undefined ? (r[col[k]] ?? '').replace(/\s+/g, ' ').trim() : '');
  const seen = new Set<string>();
  const products: JanAushadhiProduct[] = [];
  for (const r of data) {
    const name = get(r, 'name');
    if (!name) { bump('no product name'); continue; }
    const mrpInr = parseMrp(get(r, 'mrp'));
    if (mrpInr === null) { bump('no usable MRP'); continue; }
    const drugCode = get(r, 'drugCode') || null;
    const unitSize = get(r, 'unitSize') || null;
    const key = drugCode ? `code:${drugCode.toLowerCase()}` : `name:${name.toLowerCase()}|${(unitSize ?? '').toLowerCase()}`;
    if (seen.has(key)) { bump('duplicate'); continue; }
    seen.add(key);
    products.push({ drugCode, name, unitSize, mrpInr, group: get(r, 'group') || null, strength: strengthOf(name) });
  }
  return { products, skipped: [...skip].map(([reason, count]) => ({ reason, count })), missingColumns };
}
