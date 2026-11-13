/**
 * Request authentication for every server endpoint.
 *
 *   supabase   verify the app's Supabase session JWT (Authorization: Bearer <jwt>).
 *              HS256 with SUPABASE_JWT_SECRET (legacy projects) or the project's
 *              JWKS (ES256 / RS256) fetched once from SUPABASE_URL.
 *   demo       no Supabase configured: the caller's role comes from the
 *              x-demo-role header (or 'patient'). Only for a laptop demo.
 *
 * AUTH_MODE=supabase forces verification even if a secret is missing (then
 * every request is refused), so a misconfigured deployment fails closed.
 */
import { readEnv } from '../speech/config.ts';

export interface Caller {
  id: string;
  role: 'patient' | 'asha' | 'doctor' | 'admin';
  /** 'jwt' for a verified token, 'demo' for the bypass. */
  via: 'jwt' | 'demo';
  /** The phone number on a verified token (E.164), if any. */
  phone?: string;
}

export type AuthMode = 'supabase' | 'demo';

const ROLES = new Set(['patient', 'asha', 'doctor', 'admin']);

export function authMode(): AuthMode {
  const forced = readEnv('AUTH_MODE');
  if (forced === 'supabase' || forced === 'demo') return forced;
  return readEnv('SUPABASE_JWT_SECRET') || readEnv('SUPABASE_URL') ? 'supabase' : 'demo';
}

const b64url = {
  decode(s: string): Uint8Array<ArrayBuffer> {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  text(s: string): string {
    return new TextDecoder().decode(b64url.decode(s));
  },
};

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  crv?: string;
  [k: string]: unknown;
}

let jwksCache: { at: number; keys: Jwk[] } | null = null;

async function fetchJwks(fetchImpl: typeof fetch): Promise<Jwk[]> {
  const url = readEnv('SUPABASE_URL');
  if (!url) return [];
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const res = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  jwksCache = { at: Date.now(), keys: body.keys ?? [] };
  return jwksCache.keys;
}

async function importKey(header: { alg: string; kid?: string }, fetchImpl: typeof fetch): Promise<CryptoKey | null> {
  if (header.alg === 'HS256') {
    const secret = readEnv('SUPABASE_JWT_SECRET');
    if (!secret) return null;
    return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  }
  const keys = await fetchJwks(fetchImpl);
  const jwk = keys.find((k) => (header.kid ? k.kid === header.kid : true) && (!k.alg || k.alg === header.alg));
  if (!jwk) return null;
  if (header.alg === 'ES256') return crypto.subtle.importKey('jwk', jwk as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (header.alg === 'RS256') return crypto.subtle.importKey('jwk', jwk as JsonWebKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return null;
}

/** Verify a Supabase access token. Returns the caller, or null for anything not provably valid. */
export async function verifySupabaseJwt(token: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis), now = Date.now()): Promise<Caller | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: { alg: string; kid?: string; typ?: string };
  let claims: { sub?: string; exp?: number; nbf?: number; role?: string; phone?: string; user_metadata?: { role?: string }; app_metadata?: { role?: string } };
  try {
    header = JSON.parse(b64url.text(parts[0]));
    claims = JSON.parse(b64url.text(parts[1]));
  } catch {
    return null;
  }
  const key = await importKey(header, fetchImpl);
  if (!key) return null;
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = b64url.decode(parts[2]);
  const algo = header.alg === 'HS256' ? { name: 'HMAC' } : header.alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' };
  let ok = false;
  try {
    ok = await crypto.subtle.verify(algo, key, sig, data);
  } catch {
    ok = false;
  }
  if (!ok) return null;
  const t = now / 1000;
  if (typeof claims.exp === 'number' && claims.exp < t - 30) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > t + 30) return null;
  if (!claims.sub) return null;
  // Supabase's `role` claim is the Postgres role ('authenticated'); the app role lives in app_metadata,
  // which only the service role can set. user_metadata is writable by the user at sign-up, so it is
  // never trusted for the role: anyone could otherwise make themselves a doctor.
  const role = claims.app_metadata?.role ?? 'patient';
  return { id: claims.sub, role: (ROLES.has(role) ? role : 'patient') as Caller['role'], via: 'jwt', ...(claims.phone ? { phone: `+${String(claims.phone).replace(/^\+/, '')}` } : {}) };
}

/** Resolve the caller for a request under the configured mode. null = 401. */
export async function authenticate(req: Request, mode: AuthMode = authMode(), fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Caller | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (mode === 'supabase') return token ? verifySupabaseJwt(token, fetchImpl) : null;
  // demo: a token is still honoured if it verifies, otherwise the header role is taken at face value
  if (token) {
    const c = await verifySupabaseJwt(token, fetchImpl).catch(() => null);
    if (c) return c;
  }
  const role = req.headers.get('x-demo-role') ?? 'patient';
  const id = req.headers.get('x-demo-user') ?? `demo-${role}`;
  return ROLES.has(role) ? { id, role: role as Caller['role'], via: 'demo' } : null;
}
