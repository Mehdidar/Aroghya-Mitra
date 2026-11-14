/**
 * node server/scripts/importJanAushadhi.ts <products.csv> --out=<file.json> [--dry-run]
 *
 * Reads the official PMBJP (Jan Aushadhi) Product & MRP List, saved as CSV
 * from janaushadhi.gov.in ("Product Portfolio → Product MRP List") or
 * pmbi.co.in ("Product & MRP List"), and writes a JSON file of products with
 * their Jan Aushadhi MRPs.
 *
 * LICENCE: those pages say "All Rights Reserved" (PMBI). No GODL/open dataset
 * of the product list was found on data.gov.in (checked 2026-11-14). Get
 * written permission from PMBI before shipping the output in the app, and do
 * not commit the CSV or the JSON. See docs/INTEGRATIONS.md.
 *
 * This script does not download anything; you give it the file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { productRows } from '../integrations/janaushadhi/products.ts';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const dryRun = args.includes('--dry-run');
const out = opt('out');
if (!file || (!out && !dryRun)) {
  console.error('Usage: node server/scripts/importJanAushadhi.ts <products.csv> --out=<file.json> [--dry-run]');
  process.exit(1);
}
const res = productRows(readFileSync(file, 'utf8'));
if (res.missingColumns.length) {
  console.error(`The file has no ${res.missingColumns.join(', ')} column. Is this the PMBJP Product & MRP List saved as CSV?`);
  process.exit(1);
}
console.log(`${res.products.length} Jan Aushadhi products read; skipped: ${res.skipped.map((s) => `${s.count} ${s.reason}`).join(', ') || 'none'}`);
for (const p of res.products.slice(0, 5)) console.log(`  ${p.drugCode ?? '-'} · ${p.name} · ${p.unitSize ?? '?'} · ₹${p.mrpInr}`);
if (dryRun) process.exit(0);
writeFileSync(
  out!,
  JSON.stringify(
    {
      source: 'PMBJP Product & MRP List (PMBI, janaushadhi.gov.in)',
      sourceFile: basename(file),
      importedAt: new Date().toISOString(),
      licence: 'PMBI, All Rights Reserved. Use only with PMBI permission; do not commit.',
      count: res.products.length,
      products: res.products,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${res.products.length} products to ${out}. Do not commit this file.`);
