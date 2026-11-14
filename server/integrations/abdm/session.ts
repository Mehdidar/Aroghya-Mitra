/**
 * ABDM gateway session (access token) client.
 *
 *   POST {ABDM_BASE_URL}/gateway/v3/sessions
 *   headers: Content-Type: application/json, X-CM-ID: sbx, REQUEST-ID: <uuid>, TIMESTAMP: <ISO-8601 UTC, ms>
 *   body:    { clientId, clientSecret, grantType: "client_credentials" }
 *   200:     { accessToken, expiresIn, refreshExpiresIn, refreshToken, tokenType }
 *
 * Shapes follow NHA's own wrapper (see types.ts). The token is cached and
 * reused for at most 15 minutes (NHA's wrapper refreshes on the same cadence
 * because tokens expire after 20). Errors never include the client secret or
 * the token.
 */
import { ABDM_SESSION_PATH, type AbdmConfig } from './config.ts';
import type { AbdmSessionRequest, AbdmSessionResponse } from './types.ts';

export type Fetch = typeof fetch;

export class AbdmError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AbdmError';
    this.status = status;
  }
}

const MAX_REUSE_MS = 15 * 60 * 1000;
const SAFETY_MS = 60 * 1000;

export interface AbdmSessionOptions {
  fetchImpl?: Fetch;
  now?: () => number;
  requestId?: () => string;
  timeoutMs?: number;
}

export class AbdmSession {
  private readonly config: AbdmConfig;
  private readonly fetchImpl: Fetch;
  private readonly now: () => number;
  private readonly requestId: () => string;
  private readonly timeoutMs: number;
  private token: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(config: AbdmConfig, opts: AbdmSessionOptions = {}) {
    this.config = config;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = opts.now ?? Date.now;
    this.requestId = opts.requestId ?? (() => crypto.randomUUID());
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  /** A valid bearer token (without the "Bearer " prefix), fetching a new one when needed. */
  async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt) return this.token.value;
    // One request at a time: concurrent callers share the same fetch.
    this.pending ??= this.fetchToken().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** Headers for gateway calls: Authorization, X-CM-ID, REQUEST-ID, TIMESTAMP. */
  async gatewayHeaders(): Promise<Record<string, string>> {
    const token = await this.accessToken();
    return { ...this.baseHeaders(), authorization: `Bearer ${token}` };
  }

  /** Forget the cached token (e.g. after a 401 from another call). */
  reset(): void {
    this.token = null;
  }

  private baseHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-cm-id': this.config.cmId,
      'request-id': this.requestId(),
      timestamp: new Date(this.now()).toISOString(),
    };
  }

  private async fetchToken(): Promise<string> {
    const body: AbdmSessionRequest = { clientId: this.config.clientId, clientSecret: this.config.clientSecret, grantType: 'client_credentials' };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.baseUrl}${ABDM_SESSION_PATH}`, {
        method: 'POST',
        headers: this.baseHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new AbdmError(0, `ABDM gateway unreachable (${e instanceof Error ? e.name : 'network error'})`);
    }
    if (res.status === 401 || res.status === 403) throw new AbdmError(res.status, 'ABDM rejected the client id or secret');
    if (!res.ok) throw new AbdmError(res.status, `ABDM session request failed with HTTP ${res.status}`);
    let data: Partial<AbdmSessionResponse>;
    try {
      data = (await res.json()) as Partial<AbdmSessionResponse>;
    } catch {
      throw new AbdmError(502, 'ABDM session response was not JSON');
    }
    if (typeof data.accessToken !== 'string' || !data.accessToken) throw new AbdmError(502, 'ABDM session response had no accessToken');
    const lifetimeMs = typeof data.expiresIn === 'number' && data.expiresIn > 0 ? data.expiresIn * 1000 : MAX_REUSE_MS;
    const reuseMs = Math.max(0, Math.min(lifetimeMs - SAFETY_MS, MAX_REUSE_MS));
    this.token = { value: data.accessToken, expiresAt: this.now() + reuseMs };
    return data.accessToken;
  }
}
