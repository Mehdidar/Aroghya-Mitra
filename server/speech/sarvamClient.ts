/**
 * Server-side Sarvam AI client. The API key never leaves server/.
 *
 * - `api-subscription-key` header on every REST call
 * - per-request timeout, retries with exponential backoff and jitter on
 *   network errors, timeouts, 408, 429 and 5xx; honours Retry-After
 * - typed SarvamError so callers can fall back to device speech
 */

import {
  SarvamError,
  sarvamErrorFromResponse,
  sarvamErrorFromWsClose,
} from './errors.ts';
import { readSseData } from './sse.ts';
import { splitText } from './textChunks.ts';
import type {
  CallOptions,
  ChatRequest,
  ChatResult,
  IdentifyLanguageResult,
  RealtimeSttConfig,
  RealtimeSttHandlers,
  RealtimeSttSession,
  RealtimeTranscript,
  SynthesizeRequest,
  SynthesizeResult,
  TranscribeRequest,
  TranscribeResult,
  TranslateRequest,
  TranslateResult,
} from './types.ts';

export const SARVAM_DEFAULTS = {
  baseUrl: 'https://api.sarvam.ai',
  wsBaseUrl: 'wss://api.sarvam.ai',
  sttModel: 'saaras:v3',
  realtimeSttModel: 'saaras:v3-realtime',
  ttsModel: 'bulbul:v3',
  ttsSpeaker: 'shubh',
  /**
   * Measured 2026-11-13: sarvam-105b-conversations answers in ~350-400 ms with no hidden reasoning.
   * sarvam-105b is a reasoning model: ~5.5 s, and with a small max_tokens it can return empty content.
   */
  chatModel: 'sarvam-105b-conversations',
  timeoutMs: 20_000,
  maxRetries: 3,
  baseDelayMs: 300,
  maxDelayMs: 4_000,
} as const;

export const SARVAM_LIMITS = {
  sttRestSeconds: 30,
  ttsChars: 2500,
  ttsStreamChars: 3500,
  translateCharsMayura: 1000,
  translateCharsSarvamTranslate: 2000,
  lidChars: 1000,
} as const;

type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocket;

export interface SarvamClientOptions {
  apiKey: string;
  baseUrl?: string;
  wsBaseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  chatModel?: string;
  /** Injection points for tests. */
  fetch?: typeof fetch;
  WebSocket?: WebSocketCtor;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface SendOptions extends CallOptions {
  method?: 'GET' | 'POST';
  /** Called per attempt, so FormData is rebuilt for each retry. */
  body?: () => { body: BodyInit; contentType?: string };
}

export class SarvamClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly wsBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly chatModel: string;
  private readonly fetchImpl: typeof fetch;
  private readonly WebSocketImpl: WebSocketCtor | undefined;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(opts: SarvamClientOptions) {
    if (!opts.apiKey) throw new Error('SarvamClient: apiKey is required (set SARVAM_API_KEY on the server)');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? SARVAM_DEFAULTS.baseUrl).replace(/\/$/, '');
    this.wsBaseUrl = (opts.wsBaseUrl ?? SARVAM_DEFAULTS.wsBaseUrl).replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? SARVAM_DEFAULTS.timeoutMs;
    this.maxRetries = opts.maxRetries ?? SARVAM_DEFAULTS.maxRetries;
    this.baseDelayMs = opts.baseDelayMs ?? SARVAM_DEFAULTS.baseDelayMs;
    this.maxDelayMs = opts.maxDelayMs ?? SARVAM_DEFAULTS.maxDelayMs;
    this.chatModel = opts.chatModel ?? SARVAM_DEFAULTS.chatModel;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.WebSocketImpl = opts.WebSocket ?? (globalThis.WebSocket as WebSocketCtor | undefined);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
  }

  // ------------------------------------------------------------------ core

  /** Backoff with "equal jitter": half fixed, half random, capped. */
  backoffMs(attempt: number): number {
    const exp = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** attempt);
    return exp / 2 + this.random() * (exp / 2);
  }

  private async send(path: string, opts: SendOptions = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    for (let attempt = 0; ; attempt++) {
      if (opts.signal?.aborted) throw abortedError(opts.signal.reason);
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs);
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
      const built = opts.body?.();
      const headers: Record<string, string> = { 'api-subscription-key': this.apiKey };
      if (built?.contentType) headers['content-type'] = built.contentType;

      let err: SarvamError;
      try {
        const res = await this.fetchImpl(url, { method: opts.method ?? 'POST', headers, body: built?.body, signal });
        if (res.ok) return res;
        err = await sarvamErrorFromResponse(res);
      } catch (e) {
        if (e instanceof SarvamError) throw e;
        if (opts.signal?.aborted) throw abortedError(opts.signal.reason);
        err = timeout.aborted
          ? new SarvamError({ kind: 'timeout', retryable: true, message: `Sarvam ${path} timed out`, cause: e })
          : new SarvamError({ kind: 'network', retryable: true, message: `Could not reach Sarvam (${path})`, cause: e });
      }

      if (!err.retryable || attempt >= this.maxRetries) throw err;
      const wait = err.retryAfterMs !== undefined ? Math.min(err.retryAfterMs, this.maxDelayMs * 2) : this.backoffMs(attempt);
      await this.sleep(wait);
    }
  }

  private async postJson<T>(path: string, body: unknown, opts?: CallOptions): Promise<T> {
    const json = JSON.stringify(body);
    const res = await this.send(path, { ...opts, body: () => ({ body: json, contentType: 'application/json' }) });
    return (await res.json()) as T;
  }

  // ------------------------------------------------------- speech-to-text

  /** REST speech-to-text. Audio must be 30 s or shorter; use the realtime socket for longer audio. */
  async transcribe(req: TranscribeRequest, opts?: CallOptions): Promise<TranscribeResult> {
    const blob = req.audio instanceof Blob ? req.audio : new Blob([req.audio as BlobPart], { type: req.mimeType ?? 'audio/wav' });
    const fileName = req.fileName ?? `audio.${extensionFor(req.mimeType ?? blob.type)}`;
    const res = await this.send('/speech-to-text', {
      ...opts,
      body: () => {
        const form = new FormData();
        form.append('file', blob, fileName);
        form.append('model', req.model ?? SARVAM_DEFAULTS.sttModel);
        if (req.mode) form.append('mode', req.mode);
        form.append('language_code', req.languageCode ?? 'unknown');
        if (req.withTimestamps) form.append('with_timestamps', 'true');
        if (req.inputAudioCodec) form.append('input_audio_codec', req.inputAudioCodec);
        return { body: form }; // fetch sets the multipart boundary
      },
    });
    const data = (await res.json()) as {
      request_id?: string | null;
      transcript?: string;
      language_code?: string | null;
      language_probability?: number | null;
    };
    return {
      requestId: data.request_id ?? null,
      transcript: data.transcript ?? '',
      languageCode: data.language_code ?? null,
      languageProbability: data.language_probability ?? null,
    };
  }

  /**
   * Realtime speech-to-text over WebSocket (`/speech-to-text-realtime/ws`).
   * Auth uses the documented subprotocol form, which works with the standard
   * WebSocket API (Node 22+, browsers and React Native have no custom WS headers).
   */
  openRealtimeTranscription(config: RealtimeSttConfig, handlers: RealtimeSttHandlers = {}): RealtimeSttSession {
    const WS = this.WebSocketImpl;
    if (!WS) throw new Error('No WebSocket implementation available (needs Node 22+)');

    const url = new URL(`${this.wsBaseUrl}/speech-to-text-realtime/ws`);
    const params: Record<string, string | number | boolean | undefined> = {
      language_code: config.languageCode,
      model: config.model ?? SARVAM_DEFAULTS.realtimeSttModel,
      mode: config.mode,
      stream_type: config.streamType,
      endpointing: config.endpointing,
      encoding: config.encoding ?? 'linear16',
      sample_rate: config.sampleRate ?? 16000,
      return_timestamps: config.returnTimestamps,
      silence_duration_ms: config.silenceDurationMs,
      prompt: config.prompt,
    };
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

    const ws = new WS(url.toString(), [`api-subscription-key.${this.apiKey}`]);
    const queue: string[] = [];
    let open = false;

    let resolveReady!: () => void;
    let rejectReady!: (e: Error) => void;
    const ready = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });
    ready.catch(() => {}); // the caller may only await `closed`
    let resolveClosed!: (v: { code: number; reason: string }) => void;
    const closed = new Promise<{ code: number; reason: string }>((res) => (resolveClosed = res));

    const sendJson = (msg: object) => {
      const raw = JSON.stringify(msg);
      if (open) ws.send(raw);
      else queue.push(raw);
    };

    ws.onopen = () => {
      open = true;
      for (const raw of queue.splice(0)) ws.send(raw);
      resolveReady();
    };
    ws.onmessage = (ev: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer));
      } catch {
        return;
      }
      switch (msg.event) {
        case 'session.begin':
          handlers.onSessionBegin?.((msg.request_id as string) ?? null);
          break;
        case 'vad.speech_start':
          handlers.onSpeechStart?.(msg.utterance_idx as number);
          break;
        case 'vad.speech_end':
          handlers.onSpeechEnd?.(msg.utterance_idx as number);
          break;
        case 'transcript.partial':
          handlers.onPartial?.(toTranscript(msg));
          break;
        case 'transcript.final':
          handlers.onFinal?.(toTranscript(msg));
          break;
        case 'error': {
          const fatal = Boolean(msg.is_fatal);
          handlers.onError?.(
            new SarvamError({
              kind: fatal ? 'server' : 'bad_request',
              retryable: fatal,
              message: String(msg.message ?? 'Realtime STT error'),
              code: msg.code as string | undefined,
              status: msg.status_code as number | undefined,
            }),
          );
          break;
        }
      }
    };
    ws.onerror = () => {
      if (!open) rejectReady(new SarvamError({ kind: 'network', retryable: true, message: 'Could not open Sarvam realtime STT socket' }));
    };
    ws.onclose = (ev: CloseEvent) => {
      open = false;
      const err = sarvamErrorFromWsClose(ev.code, ev.reason);
      if (err) {
        rejectReady(err);
        handlers.onError?.(err);
      }
      handlers.onClose?.({ code: ev.code, reason: ev.reason });
      resolveClosed({ code: ev.code, reason: ev.reason });
    };

    return {
      ready,
      closed,
      sendAudio: (chunk) => sendJson({ event: 'audio_input', audio: toBase64(chunk) }),
      speechStart: () => sendJson({ event: 'speech_start' }),
      speechEnd: () => sendJson({ event: 'speech_end' }),
      flush: () => sendJson({ event: 'flush' }),
      end: () => sendJson({ event: 'end' }),
      close: () => ws.close(1000, 'client closed'),
    };
  }

  // ------------------------------------------------------- text-to-speech

  /** Bulbul REST text-to-speech. Text over 2500 chars is split into several requests. */
  async synthesize(req: SynthesizeRequest, opts?: CallOptions): Promise<SynthesizeResult> {
    const audiosBase64: string[] = [];
    let requestId: string | null = null;
    for (const text of splitText(req.text, SARVAM_LIMITS.ttsChars)) {
      const data = await this.postJson<{ request_id?: string; audios?: string[] }>('/text-to-speech', ttsBody({ ...req, text }), opts);
      requestId ??= data.request_id ?? null;
      audiosBase64.push(...(data.audios ?? []));
    }
    return { requestId, audiosBase64 };
  }

  /** HTTP streaming TTS: raw audio bytes as they are generated. Lowest time to first audio. */
  async synthesizeStream(
    req: SynthesizeRequest,
    opts?: CallOptions,
  ): Promise<{ contentType: string; stream: ReadableStream<Uint8Array> }> {
    if (req.text.length > SARVAM_LIMITS.ttsStreamChars) {
      throw new SarvamError({ kind: 'bad_request', retryable: false, message: `TTS stream text is over ${SARVAM_LIMITS.ttsStreamChars} chars` });
    }
    const json = JSON.stringify(ttsBody({ codec: 'mp3', ...req }));
    const res = await this.send('/text-to-speech/stream', { ...opts, body: () => ({ body: json, contentType: 'application/json' }) });
    if (!res.body) throw new SarvamError({ kind: 'server', retryable: true, message: 'TTS stream returned no body' });
    return { contentType: res.headers.get('content-type') ?? 'audio/mpeg', stream: res.body };
  }

  // ------------------------------------------------------- text

  /** Translate text. Long input is split at sentence boundaries to fit the model's limit. */
  async translate(req: TranslateRequest, opts?: CallOptions): Promise<TranslateResult> {
    const model = req.model ?? 'mayura:v1';
    if (model === 'sarvam-translate:v1' && req.sourceLanguageCode === 'auto') {
      throw new SarvamError({ kind: 'bad_request', retryable: false, message: "sarvam-translate:v1 does not accept source 'auto'; identify the language first" });
    }
    const limit = model === 'mayura:v1' ? SARVAM_LIMITS.translateCharsMayura : SARVAM_LIMITS.translateCharsSarvamTranslate;
    const parts: string[] = [];
    let requestId: string | null = null;
    let source: string | null = null;
    for (const input of splitText(req.input, limit)) {
      const data = await this.postJson<{ request_id?: string; translated_text?: string; source_language_code?: string }>(
        '/translate',
        dropUndefined({
          input,
          source_language_code: req.sourceLanguageCode,
          target_language_code: req.targetLanguageCode,
          model,
          mode: req.mode,
          speaker_gender: req.speakerGender,
          output_script: req.outputScript,
          numerals_format: req.numeralsFormat,
        }),
        opts,
      );
      requestId ??= data.request_id ?? null;
      source ??= data.source_language_code ?? null;
      parts.push(data.translated_text ?? '');
    }
    return { requestId, translatedText: parts.join(' '), sourceLanguageCode: source };
  }

  /** Language identification. Only the 11 main languages can come back (no Urdu or Kashmiri). */
  async identifyLanguage(input: string, opts?: CallOptions): Promise<IdentifyLanguageResult> {
    const data = await this.postJson<{ request_id?: string; language_code?: string | null; script_code?: string | null }>(
      '/text-lid',
      { input: input.slice(0, SARVAM_LIMITS.lidChars) },
      opts,
    );
    return { requestId: data.request_id ?? null, languageCode: data.language_code ?? null, scriptCode: data.script_code ?? null };
  }

  // ------------------------------------------------------- chat

  async chat(req: ChatRequest, opts?: CallOptions): Promise<ChatResult> {
    const data = await this.postJson<{
      model?: string;
      choices?: { finish_reason?: string | null; message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }>('/v2/chat/completions', this.chatBody(req, false), opts);
    const choice = data.choices?.[0];
    const content = (choice?.message?.content ?? '').trim();
    const finishReason = choice?.finish_reason ?? null;
    if (!content && finishReason === 'length') {
      throw new SarvamError({
        kind: 'bad_request',
        retryable: false,
        message: 'Chat reply was empty: max_tokens ran out (reasoning models spend tokens before answering). Raise maxTokens or set reasoningEffort "none".',
      });
    }
    return {
      content,
      finishReason,
      model: data.model ?? null,
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens ?? 0, completionTokens: data.usage.completion_tokens ?? 0 }
        : null,
    };
  }

  /** Streams content deltas. Retries only happen before the response starts; a stream that breaks mid-way throws. */
  async *chatStream(req: ChatRequest, opts?: CallOptions): AsyncGenerator<string> {
    const json = JSON.stringify(this.chatBody(req, true));
    const res = await this.send('/v2/chat/completions', { ...opts, body: () => ({ body: json, contentType: 'application/json' }) });
    if (!res.body) throw new SarvamError({ kind: 'server', retryable: true, message: 'Chat stream returned no body' });
    for await (const data of readSseData(res.body)) {
      let chunk: { choices?: { delta?: { content?: string | null } }[] };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  private chatBody(req: ChatRequest, stream: boolean) {
    return dropUndefined({
      model: req.model ?? this.chatModel,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      reasoning_effort: req.reasoningEffort,
      stream: stream || undefined,
    });
  }
}

// ------------------------------------------------------------------ helpers

function ttsBody(req: SynthesizeRequest) {
  return dropUndefined({
    text: req.text,
    language_code: req.languageCode,
    model: req.model ?? SARVAM_DEFAULTS.ttsModel,
    speaker: req.speaker ?? SARVAM_DEFAULTS.ttsSpeaker,
    pace: req.pace,
    speech_sample_rate: req.sampleRate,
    output_audio_codec: req.codec,
    temperature: req.temperature,
    enable_preprocessing: req.enablePreprocessing,
  });
}

function toTranscript(msg: Record<string, unknown>): RealtimeTranscript {
  return {
    utteranceIdx: Number(msg.utterance_idx ?? 0),
    text: String(msg.text ?? ''),
    language: (msg.language as string | undefined) ?? null,
    languageConfidence: (msg.language_confidence as number | undefined) ?? null,
    startS: msg.start_s as number | undefined,
    endS: msg.end_s as number | undefined,
  };
}

function abortedError(reason: unknown): SarvamError {
  return new SarvamError({ kind: 'aborted', retryable: false, message: 'Request cancelled', cause: reason });
}

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Portable base64 (Node, Deno / Supabase Edge Functions, browsers): no Buffer. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000; // stay under the argument limit of String.fromCharCode
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const toBase64 = bytesToBase64;

function extensionFor(mime: string): string {
  if (/mpeg|mp3/.test(mime)) return 'mp3';
  if (/mp4|m4a|aac/.test(mime)) return 'm4a';
  if (/ogg|opus/.test(mime)) return 'ogg';
  if (/webm/.test(mime)) return 'webm';
  if (/flac/.test(mime)) return 'flac';
  return 'wav';
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
