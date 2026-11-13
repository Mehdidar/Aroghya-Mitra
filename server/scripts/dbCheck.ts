/**
 * npm run db:check: is the server connected to Supabase, and is the schema there?
 * Prints one line per table the server needs, then what to do next.
 */
import { RestClient, restConfigFromEnv } from '../db/rest.ts';
import { loadRootEnv } from './loadEnv.ts';

loadRootEnv();
const TABLES = ['facilities', 'profiles', 'patients', 'vitals', 'prescriptions', 'dose_logs', 'referrals', 'consultations', 'access_logs', 'asha_visits', 'risk_alerts', 'patient_consents', 'record_access_grants', 'qr_token_redemptions', 'health_reports'];

const cfg = restConfigFromEnv();
if (!cfg) {
  console.log('Not connected: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the repo-root .env (the server uses in-memory demo data until then).');
  process.exit(1);
}
const db = new RestClient(cfg);
let missing = 0;
for (const t of TABLES) {
  try {
    const rows = await db.select(t, {}, { columns: '*', limit: 1 });
    console.log(`ok       ${t}${rows.length ? '' : ' (empty)'}`);
  } catch (e) {
    missing++;
    console.log(`MISSING  ${t}: ${e instanceof Error ? e.message.slice(0, 90) : e}`);
  }
}
if (missing) {
  console.log(`\n${missing} table(s) missing. Apply supabase/migrations in order (SQL editor, or psql "$DATABASE_URL" -f each file), then npm run db:seed.`);
  process.exit(1);
}
console.log('\nSchema is in place. npm run db:seed loads the demo data (safe to repeat).');
