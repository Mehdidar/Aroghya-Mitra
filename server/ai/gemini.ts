/**
 * Gemini (Google AI Studio) calls for the two things Sarvam's text models
 * cannot do: read a photo (prescriptions, food). Server-side only:
 * GEMINI_API_KEY never reaches the app.
 *
 * Uses the Interactions API (POST /v1beta/interactions), key in the
 * x-goog-api-key header (never the URL). As of 2026-11 new keys get an empty
 * 404 from generateContent and are pointed at Interactions; flash models are
 * also often at capacity, so a call walks a short model chain and moves on
 * from 404 / 429 / 5xx. GEMINI_MODEL, when set, is tried first.
 */
import { readEnv } from '../speech/config.ts';

export const GEMINI_MODEL_DEFAULT = 'gemini-3.5-flash';
/** Tried in order; the first that answers wins. */
export const GEMINI_MODEL_CHAIN = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'] as const;

export interface GeminiImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface GeminiOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Ask for JSON output (responseMimeType application/json). */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
}

export class GeminiError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;
  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export function geminiConfigured(): boolean {
  return Boolean(readEnv('GEMINI_API_KEY'));
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

interface InteractionResponse {
  model?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  error?: { message?: string; code?: string };
}

async function callInteraction(model: string, prompt: { system: string; user: string }, image: GeminiImage | null, apiKey: string, opts: GeminiOptions): Promise<{ text: string; model: string }> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const input: unknown[] = [{ type: 'text', text: prompt.user }];
  if (image) input.push({ type: 'image', data: toBase64(image.bytes), mime_type: image.mimeType });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ model, system_instruction: prompt.system, input }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new GeminiError(`Gemini unreachable: ${(e as Error).message}`, undefined, true);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 404 here means "this model is not offered to this key": try the next one.
    throw new GeminiError(`Gemini ${model} ${res.status}: ${text.slice(0, 200)}`, res.status, res.status === 404 || res.status === 429 || res.status >= 500);
  }
  const json = (await res.json()) as InteractionResponse;
  const text = (json.steps ?? [])
    .filter((st) => st.type === 'model_output')
    .flatMap((st) => st.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');
  if (!text.trim()) throw new GeminiError(`Gemini ${model} returned no text`, res.status, true);
  return { text, model: json.model ?? model };
}

/** One model call with fallback across GEMINI_MODEL_CHAIN. `image` is optional. Returns the reply text. */
export async function geminiGenerateWithModel(prompt: { system: string; user: string }, image: GeminiImage | null, opts: GeminiOptions = {}): Promise<{ text: string; model: string }> {
  const apiKey = opts.apiKey ?? readEnv('GEMINI_API_KEY');
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not set');
  const first = opts.model ?? readEnv('GEMINI_MODEL');
  const chain = [...new Set([...(first ? [first] : []), ...GEMINI_MODEL_CHAIN])];
  let last: GeminiError | null = null;
  for (const model of chain) {
    try {
      return await callInteraction(model, prompt, image, apiKey, opts);
    } catch (e) {
      if (!(e instanceof GeminiError) || !e.retryable) throw e;
      last = e;
    }
  }
  throw last ?? new GeminiError('No Gemini model answered', undefined, true);
}

export async function geminiGenerate(prompt: { system: string; user: string }, image: GeminiImage | null, opts: GeminiOptions = {}): Promise<string> {
  return (await geminiGenerateWithModel(prompt, image, opts)).text;
}

/** The VisionCall shape server/ai/food/FoodRecognizer.ts expects. */
export function geminiVisionCall(opts: GeminiOptions = {}) {
  return (image: { bytes: Uint8Array; mimeType: string }, prompt: { system: string; user: string }, callOpts: { signal?: AbortSignal } = {}) =>
    geminiGenerate(prompt, image, { ...opts, json: true, ...(callOpts.signal ? {} : {}) });
}
