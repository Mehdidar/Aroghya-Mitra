/**
 * Local dev server for the P2 endpoints, so the Expo app on a phone can use them:
 *
 *   SARVAM_API_KEY=... node server/speech/scripts/devServer.ts        (port 8787, or PORT)
 *
 * Then in mobile/.env: EXPO_PUBLIC_SARVAM_STT_URL=http://<your-laptop-LAN-IP>:8787/speech/stt
 * In production the same handler runs as a Supabase Edge Function: Deno.serve(createSpeechHandler(...)).
 */
import { createServer } from 'node:http';
import { createSarvamClientFromEnv, readEnv } from '../speech/config.ts';
import { createSpeechHandler } from '../speech/http.ts';
import { sarvamChatDeps } from '../ai/chat/sarvamChatDeps.ts';

const sarvam = createSarvamClientFromEnv();
const handler = createSpeechHandler({ sarvam, chat: sarvamChatDeps(sarvam), appToken: readEnv('P2_PROXY_TOKEN') });
const port = Number(readEnv('PORT') ?? 8787);

createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: req.method === 'GET' ? undefined : body });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(e) }));
  }
}).listen(port, () => {
  console.log(`P2 speech/chat server on http://localhost:${port}  (POST /speech/stt, /speech/tts, /ai/chat)`);
  if (!readEnv('P2_PROXY_TOKEN')) console.log('Warning: P2_PROXY_TOKEN not set, so the endpoints are open. Fine on a laptop, not on the internet.');
});
