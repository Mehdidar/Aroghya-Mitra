/**
 * QR health-card token: a short-lived HS256 JWT.
 *
 * The QR code never carries medical data: only the patient id, a scope, a
 * random token id (jti) and an expiry. It is signed with a server-only secret
 * and checked on the server when a doctor scans it.
 *
 * Uses only Web Crypto + TextEncoder + btoa/atob, so the same file runs in
 * Node 20+, Deno / Supabase Edge Functions and Cloudflare-style workers.
 * Do NOT ship this to the phone app: signing needs the secret.
 */

export const QR_ISSUER = 'aroghya-mitra';
export const QR_AUDIENCE = 'aroghya-mitra/qr-scan';
export const QR_SCOPE = 'history:read';
/** Prefix on the QR payload so the scanner can reject unrelated QR codes instantly. */
export const QR_PAYLOAD_PREFIX = 'AM1.';

export const QR_TTL_DEFAULT_SECONDS = 5 * 60;
export const QR_TTL_MIN_SECONDS = 5 * 60;
export const QR_TTL_MAX_SECONDS = 10 * 60;
/** Tolerated clock difference between the issuing and verifying servers. */
export const QR_CLOCK_SKEW_SECONDS = 30;
const MIN_SECRET_BYTES = 32;

export type QrScope = typeof QR_SCOPE;

export interface QrTokenClaims {
  iss: string;
  aud: string;
  /** Patient id. */
  sub: string;
  scope: QrScope;
  /** Unique token id, used to stop one token being redeemed by two different doctors. */
  jti: string;
  iat: number;
  exp: number;
}

export type QrVerifyFailure =
  | 'malformed'
  | 'bad_header'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'wrong_issuer'
  | 'wrong_audience'
  | 'wrong_scope';

export type QrVerifyResult =
  | { ok: true; claims: QrTokenClaims }
  | { ok: false; reason: QrVerifyFailure; claims?: QrTokenClaims };

export interface SignQrTokenInput {
  patientId: string;
  secret: string;
  /** Seconds, clamped to [5 min, 10 min]. */
  ttlSeconds?: number;
  now?: Date;
  jti?: string;
}

export interface VerifyQrTokenOptions {
  secret: string;
  now?: Date;
  clockSkewSeconds?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

export function clampTtl(ttlSeconds: number | undefined): number {
  const ttl = ttlSeconds ?? QR_TTL_DEFAULT_SECONDS;
  if (!Number.isFinite(ttl)) return QR_TTL_DEFAULT_SECONDS;
  return Math.min(QR_TTL_MAX_SECONDS, Math.max(QR_TTL_MIN_SECONDS, Math.floor(ttl)));
}

export async function signQrToken(input: SignQrTokenInput): Promise<{ token: string; claims: QrTokenClaims }> {
  assertSecret(input.secret);
  if (!input.patientId) throw new Error('patientId is required');
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const claims: QrTokenClaims = {
    iss: QR_ISSUER,
    aud: QR_AUDIENCE,
    sub: input.patientId,
    scope: QR_SCOPE,
    jti: input.jti ?? crypto.randomUUID(),
    iat,
    exp: iat + clampTtl(input.ttlSeconds),
  };
  const signingInput = `${b64urlEncodeJson(HEADER)}.${b64urlEncodeJson(claims)}`;
  const key = await hmacKey(input.secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput)));
  return { token: `${signingInput}.${b64urlEncode(sig)}`, claims };
}

export async function verifyQrToken(token: string, opts: VerifyQrTokenOptions): Promise<QrVerifyResult> {
  assertSecret(opts.secret);
  if (typeof token !== 'string' || token.length > 2048) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return { ok: false, reason: 'malformed' };
  const [h, p, s] = parts as [string, string, string];

  let header: unknown;
  let payload: unknown;
  let sig: Uint8Array;
  try {
    header = JSON.parse(decoder.decode(b64urlDecode(h)));
    payload = JSON.parse(decoder.decode(b64urlDecode(p)));
    sig = b64urlDecode(s);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  // Pin the algorithm: never trust `alg` from the token (blocks "alg: none" and key confusion).
  if (!isRecord(header) || header.alg !== 'HS256' || (header.typ !== undefined && header.typ !== 'JWT')) {
    return { ok: false, reason: 'bad_header' };
  }

  const key = await hmacKey(opts.secret);
  const valid = await crypto.subtle.verify('HMAC', key, sig as Uint8Array<ArrayBuffer>, encoder.encode(`${h}.${p}`));
  if (!valid) return { ok: false, reason: 'bad_signature' };

  if (!isClaims(payload)) return { ok: false, reason: 'malformed' };
  const claims = payload;
  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const skew = opts.clockSkewSeconds ?? QR_CLOCK_SKEW_SECONDS;

  if (claims.iss !== QR_ISSUER) return { ok: false, reason: 'wrong_issuer', claims };
  if (claims.aud !== QR_AUDIENCE) return { ok: false, reason: 'wrong_audience', claims };
  if (claims.scope !== QR_SCOPE) return { ok: false, reason: 'wrong_scope', claims };
  if (claims.iat > now + skew) return { ok: false, reason: 'not_yet_valid', claims };
  if (claims.exp <= now - skew) return { ok: false, reason: 'expired', claims };
  // A token that claims a lifetime longer than we ever issue was not made by us.
  if (claims.exp - claims.iat > QR_TTL_MAX_SECONDS) return { ok: false, reason: 'bad_header', claims };

  return { ok: true, claims };
}

/** What goes into the QR image. */
export function toQrPayload(token: string): string {
  return `${QR_PAYLOAD_PREFIX}${token}`;
}

/** Returns the token inside a scanned QR payload, or null if it is not one of ours. */
export function fromQrPayload(payload: string): string | null {
  if (typeof payload !== 'string') return null;
  const trimmed = payload.trim();
  if (!trimmed.startsWith(QR_PAYLOAD_PREFIX)) return null;
  const token = trimmed.slice(QR_PAYLOAD_PREFIX.length);
  return token.split('.').length === 3 ? token : null;
}

// ---------------------------------------------------------------------------

function assertSecret(secret: string): void {
  if (typeof secret !== 'string' || encoder.encode(secret).length < MIN_SECRET_BYTES) {
    throw new Error(`QR signing secret must be at least ${MIN_SECRET_BYTES} bytes`);
  }
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

function b64urlEncodeJson(value: unknown): string {
  return b64urlEncode(encoder.encode(JSON.stringify(value)));
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(str)) throw new Error('invalid base64url');
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isClaims(v: unknown): v is QrTokenClaims {
  return (
    isRecord(v) &&
    typeof v.iss === 'string' &&
    typeof v.aud === 'string' &&
    typeof v.sub === 'string' &&
    v.sub.length > 0 &&
    typeof v.scope === 'string' &&
    typeof v.jti === 'string' &&
    Number.isInteger(v.iat) &&
    Number.isInteger(v.exp)
  );
}
