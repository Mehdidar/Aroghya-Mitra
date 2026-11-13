/**
 * Gemini (Google AI Studio) calls for the two things Sarvam's text models
 * cannot do: read a photo (prescriptions, food). Server-side only:
 * GEMINI_API_KEY never reaches the app.
 *
 * generateContent REST, key in the x-goog-api-key header (never the URL).
 * gemini-3.8-flash is the current flash model; 2.0/2.5 return 404 for new keys.
 */
import { readEnv } from '../speech/config.ts';

export const GEMINI_MODEL_DEFAULT = 'gemini-3.8-flash';

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

/** One generateContent call. `image` is optional (text-only otherwise). Returns the reply text. */
export async function geminiGenerate(prompt: { system: string; user: string }, image: GeminiImage | null, opts: GeminiOptions = {}): Promise<string> {
  const apiKey = opts.apiKey ?? readEnv('GEMINI_API_KEY');
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not set');
  const model = opts.model ?? readEnv('GEMINI_MODEL') ?? GEMINI_MODEL_DEFAULT;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const parts: unknown[] = [];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: toBase64(image.bytes) } });
  parts.push({ text: prompt.user });
  const body = {
    systemInstruction: { parts: [{ text: prompt.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.1,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
  let res: Response;
  try {
    res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new GeminiError(`Gemini unreachable: ${(e as Error).message}`, undefined, true);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GeminiError(`Gemini ${res.status}: ${text.slice(0, 200)}`, res.status, res.status === 429 || res.status >= 500);
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text.trim()) throw new GeminiError('Gemini returned no text', res.status);
  return text;
}

/** The VisionCall shape server/ai/food/FoodRecognizer.ts expects. */
export function geminiVisionCall(opts: GeminiOptions = {}) {
  return (image: { bytes: Uint8Array; mimeType: string }, prompt: { system: string; user: string }, callOpts: { signal?: AbortSignal } = {}) =>
    geminiGenerate(prompt, image, { ...opts, json: true, ...(callOpts.signal ? {} : {}) });
}
