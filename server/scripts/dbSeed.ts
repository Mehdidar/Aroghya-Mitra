/**
 * npm run db:seed: loads the demo cast and Rekha's records into Supabase.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the repo-root .env, and
 * the migrations in supabase/migrations applied (npm run db:check tells you).
 * Safe to run again: every row is an upsert.
 *
 *   --skip-auth   do not create auth users (a local Postgres that has them already)
 */
import { RestClient, restConfigFromEnv } from '../db/rest.ts';
import { ensureAuthUsers, seedDemo } from '../db/seed.ts';
import { loadRootEnv } from './loadEnv.ts';

loadRootEnv();
const cfg = restConfigFromEnv();
if (!cfg) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the repo-root .env first.');
  process.exit(1);
}
try {
  if (!process.argv.includes('--skip-auth')) {
    const u = await ensureAuthUsers(cfg.url, cfg.key);
    console.log(`auth users: ${u.created} created, ${u.existing} already there`);
  }
  const summary = await seedDemo(new RestClient(cfg));
  console.log('seeded:', Object.entries(summary).map(([k, v]) => `${k} ${v}`).join(', '));
} catch (e) {
  console.error('seed failed:', e instanceof Error ? e.message : e);
  process.exit(1);
}
