/**
 * Local server for the app on a phone or the web build:
 *
 *   npm run dev:server                 (port 8787, or PORT)
 *
 * Reads the repo-root .env (SARVAM_API_KEY, GEMINI_API_KEY, DISHDETECT_URL,
 * QR_TOKEN_SECRET, SUPABASE_URL / SUPABASE_JWT_SECRET for real auth). With no
 * Supabase settings the server runs in demo auth mode (x-demo-role header).
 * In production the same handler runs as a Supabase Edge Function.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

import { createAppHandler } from '../app.ts';
import { authMode } from '../http/auth.ts';
import { readEnv } from '../speech/config.ts';
import { extraRoutes } from './routes.ts';

// Minimal .env loader (no dependency): KEY=value lines, quotes stripped, never overrides a set variable.
for (const file of [resolve(import.meta.dirname, '../../.env'), resolve(import.meta.dirname, '../speech/.env')]) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      const v = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch {
    /* no file */
  }
}

const handler = createAppHandler({ routes: extraRoutes() });
const port = Number(readEnv('PORT') ?? 8787);

export function lanIp(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) return n.address;
  }
  return null;
}

createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(e) }));
  }
}).listen(port, '0.0.0.0', () => {
  const ip = lanIp();
  console.log(`Aroghya Mitra server on http://localhost:${port}${ip ? `  (phones: http://${ip}:${port})` : ''}`);
  console.log(`auth: ${authMode()}  speech: ${readEnv('SARVAM_API_KEY') ? 'sarvam' : 'not configured (device fallback)'}  vision: ${readEnv('GEMINI_API_KEY') ? 'gemini' : 'not configured (demo extraction)'}  dishdetect: ${readEnv('DISHDETECT_URL') ?? 'http://localhost:8000'}`);
  if (authMode() === 'demo') console.log('Demo auth: requests are trusted by x-demo-role. Set SUPABASE_URL (+ SUPABASE_JWT_SECRET for HS256) for real JWT checks.');
});
