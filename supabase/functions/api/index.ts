/**
 * Supabase Edge Function entry: the whole Aroghya Mitra server (server/app.ts)
 * under Deno. Deploy with
 *
 *   supabase functions deploy api --no-verify-jwt
 *
 * (the handler verifies Supabase JWTs itself, see server/http/auth.ts; set
 * SUPABASE_JWT_SECRET or leave SUPABASE_URL for JWKS, plus SARVAM_API_KEY,
 * GEMINI_API_KEY, QR_TOKEN_SECRET, DISHDETECT_URL as function secrets).
 *
 * Routes are mounted under /functions/v1/api/...; the router matches on the
 * path suffix, so the app's EXPO_PUBLIC_API_URL is
 * https://<project>.supabase.co/functions/v1/api
 */
import { createAppHandler } from '../../../server/app.ts';
import { extraRoutes } from '../../../server/scripts/routes.ts';

const handler = createAppHandler({ routes: extraRoutes() });

Deno.serve((req) => {
  // Strip the function prefix so '/qr/issue' matches whether called locally (/functions/v1/api/…)
  // or on Supabase's hosted runtime, which hands the function '/api/…'.
  const url = new URL(req.url);
  const stripped = url.pathname.replace(/^(\/functions\/v1)?\/api(?=\/|$)/, '');
  return handler(new Request(`${url.origin}${stripped || '/'}${url.search}`, req));
});
