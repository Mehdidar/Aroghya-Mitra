/**
 * The server's route table. Node (scripts/devServer.ts) and the Supabase Edge
 * Function entry both build the handler from here.
 *
 *   /speech/stt, /speech/tts, /ai/chat   P2 speech + chatbot (server/speech, server/ai)
 *   /ai/food                             food photo -> DishDetect ML service, vision LLM fallback
 *   /ai/prescription                     prescription photo -> structured medicines
 *   /asha/sync, /asha/photos             ASHA outbox with server-side risk re-verification
 *   /qr/issue, /qr/scan                  signed QR health card and the doctor's scan
 *   /records/history/:patientId         the patient history view
 */
import { createSarvamClientFromEnv, readEnv } from './speech/config.ts';
import { createSpeechHandler } from './speech/http.ts';
import { sarvamChatDeps } from './ai/chat/sarvamChatDeps.ts';
import { createRouter, delegate, type Route } from './http/router.ts';
import { authenticate } from './http/auth.ts';

export interface ServerOptions {
  /** Extra routes registered by other modules (asha, qr, records, prescription, food). */
  routes?: Route[];
}

export function createAppHandler(opts: ServerOptions = {}): (req: Request) => Promise<Response> {
  const routes: Route[] = [];
  const key = readEnv('SARVAM_API_KEY');
  if (key) {
    const sarvam = createSarvamClientFromEnv();
    // The speech handler keeps its own auth hook: it accepts whoever the router accepted.
    const speech = createSpeechHandler({ sarvam, chat: sarvamChatDeps(sarvam), authorize: async (req) => (await authenticate(req)) !== null });
    routes.push(...delegate(speech, ['/speech/stt', '/speech/tts', '/ai/chat']));
  } else {
    routes.push(...delegate(async () => new Response(JSON.stringify({ error: 'Speech service not configured', fallback: 'device' }), { status: 503, headers: { 'content-type': 'application/json' } }), ['/speech/stt', '/speech/tts', '/ai/chat']));
  }
  routes.push(...(opts.routes ?? []));
  return createRouter(routes, { name: 'aroghya-mitra-server' });
}
