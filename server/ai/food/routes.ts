/**
 * POST /ai/food: the nutrition scan.
 *
 * The photo goes to the team's own model, the DishDetect India FastAPI
 * service (ml/food-classifier, DISHDETECT_URL), whose /ai/food already
 * answers in the app's FoodRecognition shape with portion, macros, fibre /
 * sugar / sodium, allergens and diet cautions. When that service is down
 * the app gets a 503 with `fallback: 'demo'`, and the app shows its
 * labelled demo result; the vision-LLM path (server/ai/food/FoodRecognizer.ts)
 * can be plugged in here once a vision call is configured.
 */
import { json, type Route } from '../../http/router.ts';
import { readEnv } from '../../speech/config.ts';

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export interface FoodRouteDeps {
  fetchImpl?: typeof fetch;
  dishDetectUrl?: string;
  timeoutMs?: number;
}

export function foodRoutes(deps: FoodRouteDeps = {}): Route[] {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const base = () => (deps.dishDetectUrl ?? readEnv('DISHDETECT_URL') ?? 'http://localhost:8000').replace(/\/$/, '');
  return [
    {
      method: 'POST',
      path: '/ai/food',
      handler: async (req) => {
        const declared = Number(req.headers.get('content-length') ?? 0);
        if (declared > MAX_PHOTO_BYTES) return json({ error: 'Photo too large' }, 413);
        let form: FormData;
        try {
          form = await req.formData();
        } catch {
          return json({ error: 'Expected multipart/form-data with a `file`' }, 400);
        }
        const file = form.get('file');
        if (!(file instanceof Blob) || file.size === 0) return json({ error: 'Missing photo' }, 400);
        if (file.size > MAX_PHOTO_BYTES) return json({ error: 'Photo too large' }, 413);

        const out = new FormData();
        out.append('file', file, 'meal.jpg');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 30_000);
        try {
          const headers: Record<string, string> = {};
          const key = readEnv('DISHDETECT_API_KEY');
          if (key) headers['x-api-key'] = key;
          const res = await fetchImpl(`${base()}/ai/food`, { method: 'POST', body: out, headers, signal: ctrl.signal });
          if (!res.ok) {
            if (res.status === 400 || res.status === 413 || res.status === 429) return json(await res.json().catch(() => ({ error: `DishDetect ${res.status}` })), res.status);
            return json({ error: 'Food model unavailable', fallback: 'demo', status: res.status }, 503);
          }
          return json(await res.json());
        } catch {
          return json({ error: 'Food model unreachable', fallback: 'demo' }, 503);
        } finally {
          clearTimeout(timer);
        }
      },
    },
  ];
}
