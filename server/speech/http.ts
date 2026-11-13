/**
 * HTTP endpoints for P2's speech and chat, so the Sarvam key stays on the server.
 * Web-standard (Request → Response): runs as a Supabase Edge Function (Deno.serve)
 * or under Node via scripts/devServer.ts.
 *
 *   POST /speech/stt   multipart: file, language_code?, mode?   → { transcript, language_code, request_id }
 *                      Same fields as Sarvam's own API, so P3's app only changes its URL
 *                      (EXPO_PUBLIC_SARVAM_STT_URL). Any client `model` is ignored: the server picks a tested model.
 *   POST /speech/tts   JSON { text, language, speaker?, pace? }  → { audioBase64, mimeType } or 503 { fallback: 'device' | 'text-only' }
 *   POST /ai/chat      JSON { message, history, language, mode?, patientId?, diet? } → text/event-stream of ChatEvent
 *                      patientId: the caller's own patients.id; the reply is personalised only if the
 *                      caller may open that record as its owner (server/ai/chat/patientContext.ts).
 *   GET  /health
 *
 * Auth: if P2_PROXY_TOKEN is set, requests need `x-app-token: <token>`. Replace with
 * Supabase JWT checks once P1's auth lands (pass `authorize`).
 */
import { SarvamError } from './errors.ts';
import { APP_LANGUAGES, LANGUAGE_CAPABILITIES, fromSarvamCode, ttsStrategy, type AppLanguage } from './languageCapabilities.ts';
import type { SarvamClient } from './sarvamClient.ts';
import type { SttMode } from './types.ts';
import { streamChatReply, type ChatDeps, type ChatTurn } from '../ai/chat/chatService.ts';
import { dietOnlyContext, parseDietPreferences } from '../ai/chat/patientContext.ts';
import { recordsPatientContextLoader, type PatientContextLoader } from '../ai/chat/patientContextLoader.ts';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_TTS_CHARS = 2500;
const STT_MODES: SttMode[] = ['transcribe', 'translate', 'verbatim', 'translit', 'codemix'];

export interface SpeechHttpDeps {
  sarvam: Pick<SarvamClient, 'transcribe' | 'synthesize'>;
  chat: ChatDeps;
  /** Return false to reject with 401. Default: x-app-token must equal `appToken` when one is set. */
  authorize?: (req: Request) => boolean | Promise<boolean>;
  appToken?: string;
  /** Loads the caller's own record for a personalised chat. Default: server auth + the records repository. */
  patientContext?: PatientContextLoader;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** Accept app codes (hi) or Sarvam codes (hi-IN, od-IN, or-IN). */
export function parseLanguage(value: unknown): AppLanguage | null {
  if (typeof value !== 'string' || !value) return null;
  if ((APP_LANGUAGES as string[]).includes(value)) return value as AppLanguage;
  return fromSarvamCode(value);
}

function errorResponse(e: unknown): Response {
  if (e instanceof SarvamError) {
    if (e.kind === 'bad_request') return json({ error: e.message }, 400);
    // Tell the app to use device speech instead of showing an error.
    return json({ error: 'Speech service unavailable', kind: e.kind, fallback: 'device' }, 503);
  }
  return json({ error: 'Internal error' }, 500);
}

export function createSpeechHandler(deps: SpeechHttpDeps): (req: Request) => Promise<Response> {
  const authorize = deps.authorize ?? ((req: Request) => !deps.appToken || req.headers.get('x-app-token') === deps.appToken);

  return async (req) => {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (req.method === 'GET' && path.endsWith('/health')) return json({ ok: true });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!(await authorize(req))) return json({ error: 'Unauthorized' }, 401);

    try {
      if (path.endsWith('/speech/stt')) return await handleStt(req, deps);
      if (path.endsWith('/speech/tts')) return await handleTts(req, deps);
      if (path.endsWith('/ai/chat')) return await handleChat(req, deps);
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

async function handleStt(req: Request, deps: SpeechHttpDeps): Promise<Response> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_AUDIO_BYTES) return json({ error: 'Audio too large' }, 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Expected multipart/form-data' }, 400);
  }
  const file = form.get('file');
  if (!(file instanceof Blob) || file.size === 0) return json({ error: 'Missing audio file' }, 400);
  if (file.size > MAX_AUDIO_BYTES) return json({ error: 'Audio too large' }, 413);

  const rawLang = form.get('language_code') ?? form.get('language');
  const lang = rawLang ? parseLanguage(rawLang) : null;
  if (rawLang && rawLang !== 'unknown' && !lang) return json({ error: `Unsupported language: ${String(rawLang)}` }, 400);
  const mode = (form.get('mode') as SttMode | null) ?? undefined;
  if (mode && !STT_MODES.includes(mode)) return json({ error: `Unsupported mode: ${mode}` }, 400);

  const r = await deps.sarvam.transcribe({
    audio: file,
    fileName: file instanceof File ? file.name : undefined,
    mimeType: file.type || undefined,
    mode,
    languageCode: lang ? LANGUAGE_CAPABILITIES[lang].sarvamCode : 'unknown',
  });
  return json({ transcript: r.transcript, language_code: r.languageCode, request_id: r.requestId });
}

async function handleTts(req: Request, deps: SpeechHttpDeps): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { text?: unknown; language?: unknown; speaker?: unknown; pace?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const lang = parseLanguage(body?.language);
  if (!text) return json({ error: 'Missing text' }, 400);
  if (text.length > MAX_TTS_CHARS) return json({ error: `Text over ${MAX_TTS_CHARS} characters` }, 413);
  if (!lang) return json({ error: 'Missing or unsupported language' }, 400);

  // Urdu, Kashmiri, Assamese: no Bulbul voice. Tell the app what to do instead of failing.
  const strategy = ttsStrategy(lang);
  if (strategy !== 'bulbul') return json({ error: 'No server voice for this language', fallback: strategy }, 503);

  const r = await deps.sarvam.synthesize({
    text,
    languageCode: LANGUAGE_CAPABILITIES[lang].sarvamCode,
    speaker: typeof body?.speaker === 'string' ? body.speaker : undefined,
    pace: typeof body?.pace === 'number' ? body.pace : undefined,
    codec: 'mp3',
  });
  return json({ audioBase64: r.audiosBase64, mimeType: 'audio/mpeg', requestId: r.requestId });
}

async function handleChat(req: Request, deps: SpeechHttpDeps): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { message?: unknown; history?: unknown; language?: unknown; mode?: unknown; patientId?: unknown; diet?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message : '';
  const lang = parseLanguage(body?.language) ?? 'en';
  const history: ChatTurn[] = Array.isArray(body?.history)
    ? (body!.history as unknown[]).filter((t): t is ChatTurn => {
        const x = t as ChatTurn;
        return !!x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string';
      })
    : [];
  if (!message.trim()) return json({ error: 'Missing message' }, 400);
  const mode = body?.mode === 'voice' ? 'voice' : 'text';
  const patientId = typeof body?.patientId === 'string' && /^[\w:-]{1,80}$/.test(body.patientId) ? body.patientId : null;
  const diet = parseDietPreferences(body?.diet);
  const loader = deps.patientContext ?? recordsPatientContextLoader();
  // Request bodies are read once: hand the loader a copy that still has the headers.
  const authReq = new Request(req.url, { headers: req.headers });
  const loadPatientContext = patientId
    ? () => loader(authReq, patientId, diet)
    : diet
      ? async () => ({ status: 'no_patient' as const, context: dietOnlyContext(diet) })
      : undefined;

  const encoder = new TextEncoder();
  const controller = new AbortController();
  req.signal?.addEventListener('abort', () => controller.abort());
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        for await (const event of streamChatReply({ message, history, language: lang, mode, loadPatientContext }, deps.chat, { signal: controller.signal })) {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch {
        if (!controller.signal.aborted) {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Chat failed', retryable: true })}\n\n`));
        }
      } finally {
        ctrl.close();
      }
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' } });
}
