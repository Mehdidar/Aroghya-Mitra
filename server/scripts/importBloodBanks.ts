/**
 * npm run data:blood-banks -- <file.csv> [--state=Karnataka] [--district=Bangalore] [--dry-run]
 *
 * Loads real blood banks from the official Blood Bank Directory (National
 * Health Portal / NIHFW; download the CSV from
 * https://aikosh.indiaai.gov.in/home/datasets/details/blood_bank_directory_updated_till_last_month.html,
 * licence GODL) into Supabase. The app then lists these instead of the demo
 * banks. Stock levels are not in the directory, so the app says "call to check
 * stock" for them. Safe to re-run: rows upsert by id.
 */
import { readFileSync } from 'node:fs';

import { directoryRows } from '../bloodbanks/directory.ts';
import { RestClient, restConfigFromEnv } from '../db/rest.ts';
import { loadRootEnv } from './loadEnv.ts';

loadRootEnv();
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
if (!file) {
  console.error('Usage: npm run data:blood-banks -- <directory.csv> [--state=Karnataka] [--district=Bangalore] [--dry-run]');
  process.exit(1);
}
const res = directoryRows(readFileSync(file, 'utf8'), { state: opt('state'), district: opt('district') });
if (res.missingColumns.length) {
  console.error(`The file has no ${res.missingColumns.join(', ')} column. Is this the Blood Bank Directory CSV?`);
  process.exit(1);
}
console.log(`${res.rows.length} blood banks ready; skipped: ${res.skipped.map((s) => `${s.count} ${s.reason}`).join(', ') || 'none'}`);
for (const r of res.rows.slice(0, 5)) console.log(`  ${r.name} · ${r.area} · ${r.phone ?? 'no phone'}${r.open_24x7 ? ' · 24x7' : ''}`);
if (args.includes('--dry-run')) process.exit(0);
const cfg = restConfigFromEnv();
if (!cfg) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the repo-root .env first.');
  process.exit(1);
}
const db = new RestClient(cfg);
for (let i = 0; i < res.rows.length; i += 200) await db.upsert('blood_banks', res.rows.slice(i, i + 200), 'id');
console.log(`Saved ${res.rows.length} blood banks to Supabase. Restart the server; the app now shows them.`);
