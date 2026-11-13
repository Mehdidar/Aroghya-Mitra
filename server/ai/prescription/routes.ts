/**
 * POST /ai/prescription   multipart `file` (image/jpeg|png|webp|heic, <= 10 MB)
 *                         or JSON { imageBase64, mimeType }
 *   -> 200 { prescription: ExtractedPrescription, demo: false, model }
 *   -> 200 { prescription: ExtractedPrescription, demo: true, reason }   (no GEMINI_API_KEY, or the model failed)
 *   -> 400 { error }                                                     (no / bad image)
 *
 * The photo goes to Gemini with P2's extraction prompt; the reply is parsed
 * with P2's lenient schema (server/ai/prescription/parse.ts). The route never
 * fails the user for a model problem: it falls back to the demo extraction and
 * says so, and the app shows the demo pill.
 */
import { json, type Route } from '../../http/router.ts';
import { readEnv } from '../../speech/config.ts';
import { GeminiError, geminiConfigured, geminiGenerate, GEMINI_MODEL_DEFAULT } from '../gemini.ts';
import { demoExtraction } from './demoExtraction.ts';
import { parsePrescription } from './parse.ts';
import { PRESCRIPTION_EXTRACTION_SYSTEM, PRESCRIPTION_SCHEMA_HINT } from './prompts.ts';
import type { ExtractedPrescription } from './schema.ts';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export type VisionExtract = (image: { bytes: Uint8Array; mimeType: string }) => Promise<string>;

export interface PrescriptionRouteDeps {
  /** Returns the model's raw reply text. Default: Gemini with GEMINI_API_KEY. */
  extract?: VisionExtract | null;
}

export function defaultExtract(): VisionExtract | null {
  if (!geminiConfigured()) return null;
  return (image) =>
    geminiGenerate(
      { system: PRESCRIPTION_EXTRACTION_SYSTEM, user: `Read this prescription photo. Reply with JSON only, matching:\n${PRESCRIPTION_SCHEMA_HINT}` },
      image,
      { json: true },
    );
}

async function readImage(req: Request): Promise<{ bytes: Uint8Array; mimeType: string } | { error: string; status: number }> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) return { error: 'Image too large', status: 413 };
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { error: 'Expected multipart/form-data', status: 400 };
    }
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) return { error: 'Missing image file', status: 400 };
    if (file.size > MAX_IMAGE_BYTES) return { error: 'Image too large', status: 413 };
    const mimeType = file.type || 'image/jpeg';
    if (!IMAGE_TYPES.has(mimeType)) return { error: `Unsupported image type: ${mimeType}`, status: 400 };
    return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType };
  }
  const body = (await req.json().catch(() => null)) as { imageBase64?: unknown; mimeType?: unknown } | null;
  if (!body || typeof body.imageBase64 !== 'string' || !body.imageBase64) return { error: 'Missing image file', status: 400 };
  const mimeType = typeof body.mimeType === 'string' && IMAGE_TYPES.has(body.mimeType) ? body.mimeType : 'image/jpeg';
  const bin = atob(body.imageBase64.replace(/^data:[^,]+,/, ''));
  if (bin.length > MAX_IMAGE_BYTES) return { error: 'Image too large', status: 413 };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mimeType };
}

export function routes(deps: PrescriptionRouteDeps = {}): Route[] {
  const extract = deps.extract === undefined ? defaultExtract() : deps.extract;
  return [
    {
      method: 'POST',
      path: '/ai/prescription',
      handler: async (req) => {
        const img = await readImage(req);
        if ('error' in img) return json({ error: img.error }, img.status);
        if (!extract) return json({ prescription: demoExtraction(), demo: true, reason: 'no_vision_model' });
        try {
          const raw = await extract(img);
          const prescription: ExtractedPrescription = parsePrescription(raw);
          return json({ prescription, demo: false, model: readEnv('GEMINI_MODEL') ?? GEMINI_MODEL_DEFAULT });
        } catch (e) {
          const reason = e instanceof GeminiError ? (e.retryable ? 'model_unavailable' : 'model_error') : 'parse_error';
          console.warn('[/ai/prescription] falling back to demo extraction:', (e as Error).message);
          return json({ prescription: demoExtraction(), demo: true, reason });
        }
      },
    },
  ];
}
