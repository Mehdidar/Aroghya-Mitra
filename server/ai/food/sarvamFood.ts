/**
 * Backup food recognition with Sarvam's image-capable chat model (gemma4 on
 * /v2/chat/completions), used when the team's own model (DishDetect) is not
 * reachable, e.g. the laptop running it is off.
 *
 * Sarvam only NAMES the dish, choosing from the 120 dishes this project has
 * curated. Portion, nutrients, diet tier, allergens and condition cautions
 * come from dishCatalog.json, which ml/food-classifier/tools/export_dish_catalog.py
 * builds with DishDetect's own code, so the numbers are the same either way.
 * A dish outside the list is shown by name with no numbers.
 *
 * Every answer is marked reliable: false and source 'vision-llm': a general
 * model's self-reported confidence is not a measured accuracy.
 */
import catalogJson from './dishCatalog.json' with { type: 'json' };

type CatalogItem = Record<string, unknown> & { name: string; confidence: number };
const CATALOG = (catalogJson as unknown as { dishes: Record<string, { item: CatalogItem; rationale?: string | null }> }).dishes;
export const CATALOG_KEYS = Object.keys(CATALOG);

export const SARVAM_VISION_MODEL_DEFAULT = 'gemma4';
const MAX_ITEMS = 3;

export interface SarvamFoodDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
  model?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}

export interface SarvamFoodResult {
  isFood: boolean;
  items: Record<string, unknown>[];
  notes: string | null;
  source: 'vision-llm';
  reliable: false;
  requestId: null;
  servedBy: { dish: string };
}

const PROMPT = `You identify food in a photo for an Indian health app.
Known dishes (use these exact keys): ${CATALOG_KEYS.join(', ')}.
Reply with JSON only, no code fences:
{"isFood": boolean, "dishes": [{"key": "<one of the keys above, or null>", "name": "<dish name in English>", "confidence": <0..1>}]}
Rules: list at most ${MAX_ITEMS} dishes, the main one first. Use a key only when the dish clearly is that dish; otherwise key null with your best name. If the photo is not food, isFood false and dishes []. Never invent nutrition.`;

/** The first JSON object in a reply, tolerating code fences and prose around it. */
export function parseReply(text: string): { isFood: boolean; dishes: { key: string | null; name: string; confidence: number }[] } | null {
  const m = /\{[\s\S]*\}/.exec(text.replace(/```(?:json)?/g, ''));
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { isFood?: unknown; dishes?: unknown };
    const dishes = Array.isArray(j.dishes) ? j.dishes : [];
    return {
      isFood: j.isFood === true,
      dishes: dishes
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({
          key: typeof d.key === 'string' && d.key in CATALOG ? d.key : null,
          name: typeof d.name === 'string' ? d.name.trim() : '',
          confidence: typeof d.confidence === 'number' && Number.isFinite(d.confidence) ? Math.min(1, Math.max(0, d.confidence)) : 0,
        }))
        .filter((d) => d.key || d.name)
        .slice(0, MAX_ITEMS),
    };
  } catch {
    return null;
  }
}

/** Turn Sarvam's pick into the app's FoodRecognition, with numbers only from the curated catalogue. */
export function toRecognition(parsed: NonNullable<ReturnType<typeof parseReply>>, model: string): SarvamFoodResult {
  const seen = new Set<string>();
  const items = parsed.dishes.flatMap((d) => {
    const id = d.key ?? d.name.toLowerCase();
    if (seen.has(id)) return [];
    seen.add(id);
    if (d.key) return [{ ...structuredClone(CATALOG[d.key].item), confidence: d.confidence }];
    return [
      {
        name: d.name,
        localName: null,
        isIndianDish: false,
        portionDescription: null,
        estimatedGrams: 200,
        per100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        confidence: d.confidence,
        nutrition: { provenance: 'none', source: null, note: 'This dish is not in our nutrition table yet, so no numbers are shown.' },
      },
    ];
  });
  const main = parsed.dishes[0]?.key ? CATALOG[parsed.dishes[0].key!].rationale : null;
  const caveat = 'Dish named by a general AI image model (Sarvam), not our own food model: check the name is right. Nutrition and cautions are our curated estimates.';
  return {
    isFood: parsed.isFood && items.length > 0 ? true : parsed.isFood,
    items,
    notes: [main, caveat].filter(Boolean).join(' '),
    source: 'vision-llm',
    reliable: false,
    requestId: null,
    servedBy: { dish: `sarvam:${model}` },
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function recognizeWithSarvam(image: { bytes: Uint8Array; mimeType: string }, deps: SarvamFoodDeps): Promise<SarvamFoodResult> {
  const model = deps.model || SARVAM_VISION_MODEL_DEFAULT;
  const base = (deps.baseUrl || 'https://api.sarvam.ai').replace(/\/$/, '');
  const send = () => (deps.fetchImpl ?? fetch)(`${base}/v2/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-subscription-key': deps.apiKey },
    signal: deps.signal,
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:${image.mimeType || 'image/jpeg'};base64,${toBase64(image.bytes)}` } },
          ],
        },
      ],
    }),
  });
  let res = await send();
  // Sarvam answers 429 when several scans arrive at once: wait as asked (max 3 s) and try once more.
  if (res.status === 429) {
    const wait = Math.min(3000, Math.max(500, Number(res.headers.get('retry-after') ?? 1.5) * 1000));
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  if (!res.ok) throw new Error(`Sarvam vision HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  const parsed = parseReply(typeof content === 'string' ? content : JSON.stringify(content ?? ''));
  if (!parsed) throw new Error('Sarvam vision reply was not JSON');
  return toRecognition(parsed, model);
}
