#!/usr/bin/env node
/**
 * One command for the demo:  npm run demo
 *
 *  1. finds the laptop's LAN IP and writes EXPO_PUBLIC_API_URL / EXPO_PUBLIC_AI_URL into apps/mobile/.env
 *  2. starts the Aroghya Mitra server (server/scripts/devServer.ts, port 8787)
 *  3. starts the DishDetect ML service if a Python venv with its requirements exists (port 8000)
 *  4. starts Expo for the app, printing the QR / URL to scan with Expo Go
 *
 * Missing keys are not fatal: the server answers 503 with a fallback hint and the app shows
 * labelled demo results. Each gap is printed here so nobody is surprised on stage.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mobile = resolve(root, 'apps/mobile');
const args = new Set(process.argv.slice(2));
const web = args.has('--web');
const serverOnly = args.has('--server-only');

function lanIp() {
  for (const list of Object.values(networkInterfaces())) for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) return n.address;
  return 'localhost';
}
function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}
function upsertEnv(file, vars) {
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`;
  }
  writeFileSync(file, text);
}

const ip = lanIp();
const serverUrl = `http://${ip}:8787`;
const env = { ...readEnvFile(resolve(root, '.env')), ...process.env };

console.log('\nAroghya Mitra demo');
console.log('==================');
console.log(`Laptop LAN IP : ${ip}`);
console.log(`Server        : ${serverUrl}   (phones on the same Wi-Fi reach this)`);
const gaps = [];
if (!env.SARVAM_API_KEY) gaps.push('SARVAM_API_KEY missing: voice and chatbot answer 503, the app uses device speech and demo replies');
if (!env.GEMINI_API_KEY) gaps.push('GEMINI_API_KEY missing: prescription reading returns the demo extraction');
if (!env.QR_TOKEN_SECRET) gaps.push('QR_TOKEN_SECRET missing: QR tokens are signed with a dev secret (fine for a demo)');
if (!env.SUPABASE_URL && !env.SUPABASE_JWT_SECRET) gaps.push('No Supabase settings: server runs in demo auth (x-demo-role)');
for (const g of gaps) console.log(`  ! ${g}`);
if (!gaps.length) console.log('  all keys present');

// 1. app env
upsertEnv(resolve(mobile, '.env'), { EXPO_PUBLIC_API_URL: web ? 'http://localhost:8787' : serverUrl, EXPO_PUBLIC_AI_URL: web ? 'http://localhost:8787' : serverUrl });
console.log(`apps/mobile/.env: EXPO_PUBLIC_API_URL=${web ? 'http://localhost:8787' : serverUrl}`);

const children = [];
const run = (name, cmd, cmdArgs, cwd, extraEnv = {}) => {
  const child = spawn(cmd, cmdArgs, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
  children.push(child);
  child.on('exit', (code) => console.log(`[${name}] exited (${code})`));
  return child;
};

// 2. server
run('server', process.execPath, [resolve(root, 'server/scripts/devServer.ts')], root, { PORT: '8787' });

// 3. ML service (optional)
const venvPy = [resolve(root, 'ml/food-classifier/.venv/bin/python'), resolve(root, '.venv/bin/python'), process.env.DISHDETECT_PYTHON].filter(Boolean).find((p) => existsSync(p));
if (venvPy) {
  run('dishdetect', venvPy, ['-m', 'uvicorn', 'api.main:app', '--host', '0.0.0.0', '--port', '8000'], resolve(root, 'ml/food-classifier'), { DISHDETECT_ENV: 'dev' });
} else {
  console.log('  ! no Python venv for ml/food-classifier (set DISHDETECT_PYTHON): nutrition scan shows demo results');
}

// 4. app
if (!serverOnly) {
  const expoArgs = ['expo', 'start', ...(web ? ['--web'] : ['--go'])];
  run('expo', 'npx', expoArgs, mobile, { EXPO_PUBLIC_API_URL: web ? 'http://localhost:8787' : serverUrl, EXPO_PUBLIC_AI_URL: web ? 'http://localhost:8787' : serverUrl });
}

const stop = () => {
  for (const c of children) c.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
