// npm run deploy:server
// Deploys the whole server (server/app.ts) as the Supabase Edge Function `api` on the project in SUPABASE_URL,
// copies the server's secrets to it, and prints the URL to put in apps/mobile/.env.
//
// Needs in the repo-root .env:
//   SUPABASE_ACCESS_TOKEN   https://supabase.com/dashboard/account/tokens (personal access token, sbp_…)
//   SUPABASE_URL, SARVAM_API_KEY, GEMINI_API_KEY, QR_TOKEN_SECRET (as for the local server)
// Optional: DISHDETECT_URL (a public URL for the food model; without it food scan shows its offline message),
//           AUTH_MODE (keep 'demo' until phone sign-in is on).
// Supabase gives every function SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY itself; names starting with
// SUPABASE_ cannot be set as secrets, so they are not copied.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { loadRootEnv } = await import(resolve(root, 'server/scripts/loadEnv.ts'));
loadRootEnv();
const env = process.env;
const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env.SUPABASE_URL ?? '')?.[1];
const missing = ['SUPABASE_ACCESS_TOKEN', 'SARVAM_API_KEY', 'GEMINI_API_KEY', 'QR_TOKEN_SECRET'].filter((k) => !env[k]);
if (!ref) missing.unshift('SUPABASE_URL (https://<ref>.supabase.co)');
if (missing.length) {
  console.error(`Missing in the repo-root .env: ${missing.join(', ')}`);
  process.exit(1);
}
const base = `https://${ref}.supabase.co/functions/v1/api`;
const secrets = {
  SARVAM_API_KEY: env.SARVAM_API_KEY,
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  QR_TOKEN_SECRET: env.QR_TOKEN_SECRET,
  AUTH_MODE: env.AUTH_MODE || 'demo',
  PUBLIC_BASE_URL: base,
  ...(env.DISHDETECT_URL && !/localhost|127\.0\.0\.1/.test(env.DISHDETECT_URL) ? { DISHDETECT_URL: env.DISHDETECT_URL } : {}),
  ...(env.SARVAM_CHAT_MODEL ? { SARVAM_CHAT_MODEL: env.SARVAM_CHAT_MODEL } : {}),
};
// The Supabase CLI asks before changing a hosted project; --yes answers for you (npm run deploy:server -- --yes).
const confirmed = process.argv.includes('--yes') ? ['--yes'] : [];
const run = (args) => {
  const r = spawnSync('npx', ['--yes', 'supabase', ...args, ...confirmed], { cwd: root, stdio: 'inherit', env: { ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
// Secrets go through a temporary file so they never appear in the process list.
const dir = mkdtempSync(join(tmpdir(), 'am-secrets-'));
const file = join(dir, 'secrets.env');
try {
  writeFileSync(file, Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n'), { mode: 0o600 });
  console.log(`Setting ${Object.keys(secrets).length} secrets on project ${ref} …`);
  run(['secrets', 'set', `--remote=${ref}`, '--env-file', file]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('Deploying the server as the Edge Function "api" …');
run(['functions', 'deploy', 'api', `--remote=${ref}`, '--no-verify-jwt']);
const health = await fetch(`${base}/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
console.log('\nHealth check:', JSON.stringify(health));
console.log(`\nDone. In apps/mobile/.env set:\n  EXPO_PUBLIC_API_URL=${base}\n  EXPO_PUBLIC_AI_URL=${base}\nthen restart Expo. Phones then work anywhere, not only on your Wi-Fi.`);
if (!secrets.DISHDETECT_URL) console.log('Food scan: the food model runs on your laptop only; set DISHDETECT_URL to a public host to enable it online.');
