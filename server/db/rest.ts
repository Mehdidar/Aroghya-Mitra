/**
 * A small PostgREST client for Supabase, used with the service-role key.
 *
 * Server only. The service-role key bypasses row-level security, so every
 * route that uses this client checks access itself first (server/records/access.ts
 * mirrors the RLS policies). The key lives in the repo-root .env and never
 * reaches the app.
 *
 *   SUPABASE_URL               https://<ref>.supabase.co (or a local PostgREST)
 *   SUPABASE_SERVICE_ROLE_KEY  sb_secret_... or the legacy service_role JWT
 */
export type Fetch = typeof fetch;

export class DbError extends Error {
  readonly status: number;
  readonly detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'DbError';
    this.status = status;
    this.detail = detail;
  }
}

import { readEnv as readAnyEnv } from '../speech/config.ts';

// Node (process.env) or Deno / Supabase Edge Functions (Deno.env); empty counts as unset.
const readEnv = (k: string) => readAnyEnv(k) || undefined;

export interface RestConfig {
  /** Base URL of the project (…supabase.co) or of a bare PostgREST server. */
  url: string;
  key: string;
  /** '/rest/v1' for Supabase; '' for a bare PostgREST (local tests). */
  restPath?: string;
  fetchImpl?: Fetch;
}

/** Supabase credentials from the environment, or null when the server should use its in-memory demo data. */
export function restConfigFromEnv(): RestConfig | null {
  const url = readEnv('SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  // SUPABASE_REST_PATH= (empty) points at a bare PostgREST, as in the local integration test.
  const restPath = readAnyEnv('SUPABASE_REST_PATH') ?? '/rest/v1';
  return { url, key, restPath };
}

export type Filter = Record<string, string>;

export class RestClient {
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: Fetch;

  constructor(cfg: RestConfig) {
    this.base = cfg.url.replace(/\/$/, '') + (cfg.restPath ?? '/rest/v1');
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.headers = { apikey: cfg.key, 'content-type': 'application/json' };
    // Legacy keys are JWTs and go in Authorization too; new sb_secret_ keys are sent as apikey only.
    if (cfg.key.startsWith('eyJ')) this.headers.authorization = `Bearer ${cfg.key}`;
  }

  private async call<T>(method: string, table: string, query: URLSearchParams, body?: unknown, prefer?: string): Promise<T> {
    const qs = query.toString();
    const res = await this.fetchImpl(`${this.base}/${table}${qs ? `?${qs}` : ''}`, {
      method,
      headers: prefer ? { ...this.headers, prefer } : this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = text ? safeJson(text) : null;
    if (!res.ok) {
      const msg = (parsed as { message?: string } | null)?.message ?? (text.slice(0, 200) || `HTTP ${res.status}`);
      throw new DbError(res.status, `${method} ${table}: ${msg}`, parsed);
    }
    return parsed as T;
  }

  /** SELECT with PostgREST filters, e.g. { patient_id: 'eq.<id>' }. */
  select<T>(table: string, filter: Filter = {}, opts: { columns?: string; order?: string; limit?: number } = {}): Promise<T[]> {
    const q = new URLSearchParams({ select: opts.columns ?? '*', ...filter });
    if (opts.order) q.set('order', opts.order);
    if (opts.limit !== undefined) q.set('limit', String(opts.limit));
    return this.call<T[]>('GET', table, q);
  }

  async selectOne<T>(table: string, filter: Filter): Promise<T | null> {
    const rows = await this.select<T>(table, filter, { limit: 1 });
    return rows[0] ?? null;
  }

  insert<T>(table: string, rows: object | object[]): Promise<T[]> {
    return this.call<T[]>('POST', table, new URLSearchParams(), rows, 'return=representation');
  }

  /** INSERT … ON CONFLICT (onConflict) DO UPDATE (or DO NOTHING with ignore: true). */
  upsert<T>(table: string, rows: object | object[], onConflict: string, opts: { ignore?: boolean } = {}): Promise<T[]> {
    const q = new URLSearchParams({ on_conflict: onConflict });
    return this.call<T[]>('POST', table, q, rows, `resolution=${opts.ignore ? 'ignore' : 'merge'}-duplicates,return=representation`);
  }

  delete(table: string, filter: Filter): Promise<unknown> {
    if (!Object.keys(filter).length) throw new DbError(400, `refusing to delete every row of ${table}`);
    return this.call('DELETE', table, new URLSearchParams(filter), undefined, 'return=minimal');
  }

  update<T>(table: string, filter: Filter, patch: object): Promise<T[]> {
    return this.call<T[]>('PATCH', table, new URLSearchParams(filter), patch, 'return=representation');
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** PostgREST `in.(…)` filter value. */
export const inList = (ids: string[]) => `in.(${ids.map((i) => `"${i.replace(/"/g, '')}"`).join(',')})`;
