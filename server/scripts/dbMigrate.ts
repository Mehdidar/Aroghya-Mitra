/**
 * npm run db:migrate: applies supabase/migrations/*.sql, in order, to DATABASE_URL.
 *
 * DATABASE_URL is the Postgres connection string from the Supabase dashboard
 * (Connect → Session pooler), e.g.
 *   postgresql://postgres.<ref>:<db password>@aws-0-<region>.pooler.supabase.com:5432/postgres
 * Put it in the repo-root .env. It is only needed for this command; the running
 * server talks to Supabase over HTTPS with SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uses a local `psql` if there is one, otherwise the supabase/postgres Docker image.
 * Every migration is written to be re-runnable (create … if not exists, drop policy if exists).
 *   --skip=4003   leave out migrations whose name starts with 4003 (a local Postgres without Supabase Storage)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadRootEnv } from './loadEnv.ts';

loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (Supabase dashboard → Connect → Session pooler) in the repo-root .env.');
  process.exit(1);
}
const dir = resolve(import.meta.dirname, '../../supabase/migrations');
const skip = process.argv.filter((a) => a.startsWith('--skip=')).map((a) => a.slice(7));
const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && !skip.some((p) => f.startsWith(p))).sort();
const hasPsql = spawnSync('psql', ['--version']).status === 0;
const image = 'supabase/postgres:17.6.1.013';

for (const f of files) {
  process.stdout.write(`applying ${f} … `);
  try {
    if (hasPsql) {
      execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', join(dir, f)], { stdio: ['ignore', 'ignore', 'pipe'] });
    } else {
      execFileSync('docker', ['run', '--rm', '-i', '--entrypoint', 'psql', image, url.replace('@localhost', '@host.docker.internal').replace('@127.0.0.1', '@host.docker.internal'), '-v', 'ON_ERROR_STOP=1', '-q', '-f', `/m/${f}`].flatMap((a) => (a === '-i' ? ['-i', '-v', `${dir}:/m:ro`] : [a])), { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    console.log('ok');
  } catch (e) {
    const err = (e as { stderr?: Buffer }).stderr?.toString().trim() ?? String(e);
    console.log('FAILED');
    console.error(err.split('\n').slice(-5).join('\n'));
    process.exit(1);
  }
}
console.log(`\n${files.length} migrations applied. Next: npm run db:seed`);
