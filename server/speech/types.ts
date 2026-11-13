/** Request and response types for the Sarvam REST and WebSocket APIs (docs.sarvam.ai, 2026-11-13). */

export type SttModel = 'saaras:v3' | 'saaras:v4';
export type RealtimeSttModel = 'saaras:v3-realtime' | 'saaras:v4';
/** `mode` is documented for saaras:v3. The v4 docs disagree about support, so we default to v3. */
export type SttMode = 'transcribe' | 'translate' | 'verbatim' | 'translit' | 'codemix';
export type TtsModel = 'bulbul:v3' | 'bulbul:v4-flash';
export type TtsCodec = 'mp3' | 'linear16' | 'mulaw' | 'alaw' | 'flac' | 'aac' | 'wav';
export type TtsSampleRate = 8000 | 16000 | 22050 | 24000 | 32000 | 44100 | 48000;
export type TranslateModeName = 'formal' | 'modern-colloquial' | 'classic-colloquial' | 'code-mixed';

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface TranscribeRequest {
  audio: Blob | Uint8Array;
  fileName?: string;
  mimeType?: string;
  model?: SttModel;
  mode?: SttMode;
  /** Sarvam code such as hi-IN, or 'unknown' for auto-detect. */
  languageCode?: string;
  withTimestamps?: boolean;
  /** Required for raw PCM: pcm_s16le | pcm_l16 | pcm_raw (16 kHz only). */
  inputAudioCodec?: string;
}

export interface TranscribeResult {
  requestId: string | null;
  transcript: string;
  languageCode: string | null;
  languageProbability: number | null;
}

export interface SynthesizeRequest {
  text: string;
  languageCode: string;
  model?: TtsModel;
  speaker?: string;
  pace?: number;
  sampleRate?: TtsSampleRate;
  codec?: TtsCodec;
  temperature?: number;
  enablePreprocessing?: boolean;
}

export interface SynthesizeResult {
  requestId: string | null;
  /** Base64 audio, one entry per input text. */
  audiosBase64: string[];
}

export interface TranslateRequest {
  input: string;
  sourceLanguageCode: string; // 'auto' is allowed only with mayura:v1
  targetLanguageCode: string;
  model?: 'mayura:v1' | 'sarvam-translate:v1';
  mode?: TranslateModeName;
  speakerGender?: 'Male' | 'Female';
  outputScript?: 'roman' | 'fully-native' | 'spoken-form-in-native' | null;
  numeralsFormat?: 'international' | 'native';
}

export interface TranslateResult {
  requestId: string | null;
  translatedText: string;
  sourceLanguageCode: string | null;
}

export interface IdentifyLanguageResult {
  requestId: string | null;
  languageCode: string | null;
  scriptCode: string | null;
}

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** 'none' turns reasoning off on reasoning models such as sarvam-105b. */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface ChatResult {
  content: string;
  /** 'stop', 'length', ... */
  finishReason: string | null;
  model: string | null;
  usage: { promptTokens: number; completionTokens: number } | null;
}

export interface RealtimeSttConfig {
  /** 'auto' or a realtime code (note: or-IN, not od-IN). */
  languageCode: string;
  model?: RealtimeSttModel;
  mode?: SttMode;
  streamType?: 'fast' | 'balanced' | 'simulated';
  endpointing?: 'vad' | 'manual';
  encoding?: 'linear16' | 'linear32' | 'mulaw' | 'alaw';
  sampleRate?: 8000 | 16000;
  returnTimestamps?: boolean;
  silenceDurationMs?: number;
  prompt?: string;
}

export interface RealtimeTranscript {
  utteranceIdx: number;
  text: string;
  language: string | null;
  languageConfidence?: number | null;
  startS?: number;
  endS?: number;
}

export interface RealtimeSttHandlers {
  onSessionBegin?(requestId: string | null): void;
  onSpeechStart?(utteranceIdx: number): void;
  onSpeechEnd?(utteranceIdx: number): void;
  onPartial?(t: RealtimeTranscript): void;
  onFinal?(t: RealtimeTranscript): void;
  onError?(err: Error): void;
  onClose?(info: { code: number; reason: string }): void;
}

export interface RealtimeSttSession {
  /** Resolves when the socket is open. Audio sent earlier is queued. */
  ready: Promise<void>;
  /** Resolves when the socket has closed. */
  closed: Promise<{ code: number; reason: string }>;
  /** Raw PCM in the configured encoding and sample rate (mono). */
  sendAudio(chunk: Uint8Array): void;
  /** Manual endpointing: mark start and end of speech, or force a final transcript. */
  speechStart(): void;
  speechEnd(): void;
  flush(): void;
  /** Ask the server to finish gracefully (it sends final transcripts, then session.end). */
  end(): void;
  /** Close immediately. */
  close(): void;
}
