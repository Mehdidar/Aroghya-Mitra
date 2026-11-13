/**
 * Typed errors for every Sarvam call, so callers (SpeechService, AIService)
 * can tell "Sarvam is unreachable → fall back to device" from "bad request".
 */

export type SarvamErrorKind =
  | 'network' // DNS / connection refused / offline
  | 'timeout' // our request timeout fired
  | 'aborted' // caller cancelled — never retry, never fall back
  | 'auth' // 401/403, bad or missing key
  | 'quota' // 402, credits or seat budget exhausted
  | 'rate_limit' // 429
  | 'bad_request' // 400/404/422 — our fault
  | 'server'; // 408/5xx

export interface SarvamErrorInit {
  kind: SarvamErrorKind;
  message: string;
  status?: number;
  code?: string;
  requestId?: string;
  retryable: boolean;
  retryAfterMs?: number;
  cause?: unknown;
}

export class SarvamError extends Error {
  readonly kind: SarvamErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(init: SarvamErrorInit) {
    super(init.message, { cause: init.cause });
    this.name = 'SarvamError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.retryable = init.retryable;
    this.retryAfterMs = init.retryAfterMs;
  }

  /** True when the right move is to use device speech / cached content instead. */
  get isServiceUnavailable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      this.kind === 'server' ||
      this.kind === 'rate_limit' ||
      this.kind === 'quota' ||
      this.kind === 'auth'
    );
  }
}

/** Codes Sarvam documents as "do not retry until the account is topped up". */
const NON_RETRYABLE_QUOTA_CODES = new Set(['insufficient_quota_error', 'seat_budget_exhausted_error']);
const AUTH_CODES = new Set(['invalid_api_key_error', 'authentication_error']);

export function classifyHttpError(
  status: number,
  code?: string,
): { kind: SarvamErrorKind; retryable: boolean } {
  if (status === 402 || (code && NON_RETRYABLE_QUOTA_CODES.has(code))) return { kind: 'quota', retryable: false };
  if (status === 401 || status === 403 || (code && AUTH_CODES.has(code))) return { kind: 'auth', retryable: false };
  if (status === 429) return { kind: 'rate_limit', retryable: true };
  if (status === 408 || status >= 500) return { kind: 'server', retryable: true };
  return { kind: 'bad_request', retryable: false };
}

export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return undefined;
}

export async function sarvamErrorFromResponse(res: Response): Promise<SarvamError> {
  let message = `Sarvam request failed with HTTP ${res.status}`;
  let code: string | undefined;
  let requestId: string | undefined;
  try {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { error?: { message?: string; code?: string; request_id?: string } };
      if (body.error?.message) message = body.error.message;
      code = body.error?.code;
      requestId = body.error?.request_id;
    } catch {
      if (text) message = `${message}: ${text.slice(0, 300)}`;
    }
  } catch {
    // body unreadable — keep the generic message
  }
  const { kind, retryable } = classifyHttpError(res.status, code);
  return new SarvamError({
    kind,
    retryable,
    message,
    status: res.status,
    code,
    requestId,
    retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
  });
}

/** WebSocket close codes documented for the realtime STT socket. */
export function sarvamErrorFromWsClose(code: number, reason: string): SarvamError | null {
  if (code === 1000) return null;
  if (code === 1003) {
    const isRate = /rate|quota/i.test(reason);
    return new SarvamError({
      kind: isRate ? 'rate_limit' : 'auth',
      retryable: isRate,
      message: reason || 'Sarvam rejected the stream (rate limit, quota or key)',
    });
  }
  if (code === 1008) return new SarvamError({ kind: 'timeout', retryable: true, message: reason || 'Stream closed for inactivity' });
  if (code === 4000) return new SarvamError({ kind: 'bad_request', retryable: false, message: reason || 'Stream config rejected' });
  return new SarvamError({ kind: 'server', retryable: true, message: reason || `Stream closed with code ${code}` });
}
