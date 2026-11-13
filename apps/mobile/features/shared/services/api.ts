/**
 * The one way the app talks to the Aroghya Mitra server (server/app.ts):
 * base URL from EXPO_PUBLIC_API_URL, the signed-in role as demo-auth
 * headers, and the Supabase session token as a Bearer when one exists.
 *
 * No API key ever travels from the app: Sarvam, Gemini and the QR secret
 * live on the server. See docs/STATUS.md for which calls fall back to a
 * demo path when the server is unreachable.
 */
import { patientConfig } from '@/features/shared/services/config';
import { useSession } from '@/features/shared/state/session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let sessionToken: string | null = null;
/** Set by the auth service after a real Supabase sign-in; cleared on sign-out. */
export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function apiBaseUrl(): string {
  return patientConfig.apiUrl.replace(/\/$/, '');
}

export function authHeaders(): Record<string, string> {
  const { role } = useSession.getState();
  const user = role ? useSession.getState().currentUserId?.() : undefined;
  const h: Record<string, string> = {};
  if (sessionToken) h.authorization = `Bearer ${sessionToken}`;
  if (role) h['x-demo-role'] = role;
  if (user) h['x-demo-user'] = user;
  return h;
}

export type ApiOptions = RequestInit & { timeoutMs?: number; fetchImpl?: typeof fetch };

/** fetch() against the server with auth headers and a timeout. Throws ApiError for HTTP errors; network errors propagate. */
export async function apiFetch(path: string, opts: ApiOptions = {}): Promise<Response> {
  const { timeoutMs = 20_000, fetchImpl = globalThis.fetch.bind(globalThis), headers, ...init } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers: { ...authHeaders(), ...(headers as Record<string, string> | undefined) },
      signal: init.signal ?? ctrl.signal,
    });
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.clone().json();
      } catch {
        /* not json */
      }
      throw new ApiError(res.status, `HTTP ${res.status} from ${path}`, body);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** JSON in, JSON out. */
export async function apiJson<T>(path: string, body?: unknown, opts: ApiOptions = {}): Promise<T> {
  const res = await apiFetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers as Record<string, string> | undefined) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** True when the server answered /health recently. Cached for 10 s so screens can branch to demo paths quickly. */
let healthCache: { at: number; ok: boolean } | null = null;
export async function serverReachable(fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<boolean> {
  if (healthCache && Date.now() - healthCache.at < 10_000) return healthCache.ok;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetchImpl(`${apiBaseUrl()}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    healthCache = { at: Date.now(), ok: res.ok };
  } catch {
    healthCache = { at: Date.now(), ok: false };
  }
  return healthCache.ok;
}
