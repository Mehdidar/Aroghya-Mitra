/**
 * One web-standard router for every server endpoint, so the same handler runs
 * under Node (server/scripts/devServer.ts) and as a Supabase Edge Function.
 *
 * Each module registers routes as (method, path) -> handler(req, caller).
 * Auth (server/http/auth.ts) runs before every route except /health, and
 * CORS headers are added to every response so the web build can call it.
 */
import { authenticate, authMode, type Caller } from './auth.ts';

export type RouteHandler = (req: Request, ctx: { caller: Caller; url: URL }) => Promise<Response> | Response;
export type Route = { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string | RegExp; handler: RouteHandler; public?: boolean };

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-demo-role,x-demo-user,x-app-token',
};

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export function createRouter(routes: Route[], opts: { name?: string; version?: string } = {}) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
    if (req.method === 'GET' && path === '/health') {
      return withCors(json({ ok: true, name: opts.name ?? 'aroghya-mitra-server', version: opts.version ?? 'dev', auth: authMode() }));
    }
    const route = routes.find((r) => r.method === req.method && (typeof r.path === 'string' ? r.path === path : r.path.test(path)));
    if (!route) return withCors(json({ error: 'Not found' }, 404));
    let caller: Caller | null = null;
    if (!route.public) {
      caller = await authenticate(req);
      if (!caller) return withCors(json({ error: 'Unauthorized' }, 401));
    }
    try {
      const res = await route.handler(req, { caller: caller ?? { id: 'anonymous', role: 'patient', via: 'demo' }, url });
      return withCors(res);
    } catch (e) {
      console.error(`[${req.method} ${path}]`, e);
      return withCors(json({ error: 'Internal error' }, 500));
    }
  };
}

/** Wrap P2's speech handler (its own path matching) as routes on this router. */
export function delegate(handler: (req: Request) => Promise<Response>, paths: string[], method: Route['method'] = 'POST'): Route[] {
  return paths.map((path) => ({ method, path, handler: (req) => handler(req) }));
}
