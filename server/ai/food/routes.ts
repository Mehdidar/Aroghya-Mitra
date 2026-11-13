/**
 * POST /ai/food: the nutrition scan.
 *
 * 1. The team's own model, the DishDetect India FastAPI service
 *    (ml/food-classifier, DISHDETECT_URL), whose /ai/food answers in the app's
 *    FoodRecognition shape with portion, macros, allergens and diet cautions.
 * 2. When it is not configured or not reachable (e.g. the laptop hosting it is
 *    off): Sarvam's image model names the dish and the curated catalogue
 *    supplies the numbers (sarvamFood.ts). Marked source 'vision-llm', reliable false.
 * 3. When neither answers: 503 with `fallback: 'demo'`; the app shows its
 *    labelled demo result.
 * A DishDetect answer that declines to name a dish is passed on as is: the
 * backup is for an absent model, not a second opinion on an uncertain one.
 */
import { json, type Route } from '../../http/router.ts';
import { readEnv } from '../../speech/config.ts';
import { recognizeWithSarvam } from './sarvamFood.ts';

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export interface FoodRouteDeps {
  fetchImpl?: typeof fetch;
  dishDetectUrl?: string;
  timeoutMs?: number;
  /** Override for tests; defaults to SARVAM_API_KEY. Empty string turns the backup off. */
  sarvamApiKey?: string;
}

export function foodRoutes(deps: FoodRouteDeps = {}): Route[] {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const configured = () => deps.dishDetectUrl ?? readEnv('DISHDETECT_URL');
  const base = () => (configured() ?? 'http://localhost:8000').replace(/\/$/, '');
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

        const unavailable = async (why: Record<string, unknown>) => {
          const key = deps.sarvamApiKey ?? readEnv('SARVAM_API_KEY');
          if (!key) return json({ ...why, fallback: 'demo' }, 503);
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 30_000);
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const rec = await recognizeWithSarvam({ bytes, mimeType: file.type || 'image/jpeg' }, { apiKey: key, fetchImpl, model: readEnv('SARVAM_VISION_MODEL'), baseUrl: readEnv('SARVAM_BASE_URL'), signal: ctrl.signal });
            return json(rec);
          } catch (e) {
            console.warn('[ai/food] Sarvam backup failed:', e instanceof Error ? e.message : e);
            return json({ ...why, backup: 'failed', fallback: 'demo' }, 503);
          } finally {
            clearTimeout(timer);
          }
        };

        // Hosted with no food-model address: go straight to the backup.
        if (!configured()) return unavailable({ error: 'Food model not configured' });

        const out = new FormData();
        out.append('file', file, 'meal.jpg');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 30_000);
        let res: Response;
        try {
          const headers: Record<string, string> = {};
          const key = readEnv('DISHDETECT_API_KEY');
          if (key) headers['x-api-key'] = key;
          res = await fetchImpl(`${base()}/ai/food`, { method: 'POST', body: out, headers, signal: ctrl.signal });
        } catch {
          return unavailable({ error: 'Food model unreachable' });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) {
          if (res.status === 400 || res.status === 413 || res.status === 429) return json(await res.json().catch(() => ({ error: `DishDetect ${res.status}` })), res.status);
          return unavailable({ error: 'Food model unavailable', status: res.status });
        }
        return json(await res.json());
      },
    },
  ];
}
