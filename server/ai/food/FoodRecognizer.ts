/**
 * Food recognition sits behind one interface, so the team's own model
 * (DishDetect India, the FastAPI service in api/main.py) can replace the vision
 * LLM without touching the app.
 */
import { FOOD_ANALYSIS_SYSTEM, FOOD_SCHEMA_HINT } from './prompts';
import type { FoodAnalysis, FoodItem } from './schema';

export interface FoodImage {
  bytes: Uint8Array;
  mimeType: string; // image/jpeg | image/png
  fileName?: string;
}

export interface FoodRecognition extends FoodAnalysis {
  source: 'vision-llm' | 'dishdetect';
  /** False when the recognizer itself says the result should not be trusted. */
  reliable: boolean;
}

export interface FoodRecognizer {
  readonly id: string;
  recognize(image: FoodImage, opts?: { signal?: AbortSignal }): Promise<FoodRecognition>;
}

// ---------------------------------------------------------------- vision LLM

/** Any multimodal model call (Claude, Gemini or Sarvam) that returns the raw reply text. */
export type VisionCall = (image: FoodImage, prompt: { system: string; user: string }, opts: { signal?: AbortSignal }) => Promise<string>;

export class VisionLlmFoodRecognizer implements FoodRecognizer {
  readonly id: string;
  constructor(
    private readonly vision: VisionCall,
    private readonly parse: (raw: string) => FoodAnalysis,
    id = 'vision-llm',
  ) {
    this.id = id;
  }

  async recognize(image: FoodImage, opts: { signal?: AbortSignal } = {}): Promise<FoodRecognition> {
    const raw = await this.vision(
      image,
      { system: FOOD_ANALYSIS_SYSTEM, user: `Analyse this meal photo. Reply with JSON only, matching:\n${FOOD_SCHEMA_HINT}` },
      opts,
    );
    const analysis = this.parse(raw);
    return { ...analysis, source: 'vision-llm', reliable: analysis.isFood && analysis.items.length > 0 };
  }
}

// ---------------------------------------------------------------- DishDetect

/** Default portion when DishDetect names a dish (it returns no portion size). The user adjusts it with the slider. */
export const DEFAULT_PORTION_GRAMS = 200;

interface DishDetectResponse {
  dish?: { name?: string | null; raw_prediction?: string; local_name?: string | null; confidence?: number; recognized?: boolean };
  diet?: { reliable?: boolean };
  nutrition?: {
    provenance?: 'verified' | 'estimated' | 'none';
    nutrients?: { kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number };
  } | null;
  warnings?: string[];
}

/**
 * Calls DishDetect India's POST /predict (multipart `file`, `x-api-key` header).
 * Server-side only. One dish per photo; no portion estimate.
 */
export class DishDetectFoodRecognizer implements FoodRecognizer {
  readonly id = 'dishdetect';
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async recognize(image: FoodImage, opts: { signal?: AbortSignal } = {}): Promise<FoodRecognition> {
    const form = new FormData();
    form.append('file', new Blob([image.bytes as BlobPart], { type: image.mimeType }), image.fileName ?? 'meal.jpg');
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/predict`, {
      method: 'POST',
      body: form,
      headers: this.apiKey ? { 'x-api-key': this.apiKey } : undefined,
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`DishDetect /predict failed: HTTP ${res.status}`);
    return mapDishDetect((await res.json()) as DishDetectResponse);
  }
}

export function mapDishDetect(r: DishDetectResponse): FoodRecognition {
  const name = r.dish?.name;
  const n = r.nutrition?.nutrients;
  const hasNutrition = r.nutrition?.provenance !== 'none' && n?.kcal !== undefined;
  if (!name || !r.dish?.recognized) {
    return { isFood: true, items: [], notes: r.warnings?.join(' ') ?? null, source: 'dishdetect', reliable: false };
  }
  const item: FoodItem = {
    name: name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    localName: r.dish.local_name ?? null,
    isIndianDish: true,
    portionDescription: null,
    estimatedGrams: DEFAULT_PORTION_GRAMS,
    per100g: {
      kcal: hasNutrition ? n!.kcal ?? 0 : 0,
      proteinG: hasNutrition ? n!.protein_g ?? 0 : 0,
      carbsG: hasNutrition ? n!.carbs_g ?? 0 : 0,
      fatG: hasNutrition ? n!.fat_g ?? 0 : 0,
    },
    confidence: r.dish.confidence ?? 0,
  };
  return {
    isFood: true,
    items: [item],
    notes: r.warnings?.join(' ') ?? null,
    source: 'dishdetect',
    // DishDetect marks its own results unreliable until the Indian heads are trained.
    reliable: Boolean(r.diet?.reliable) && hasNutrition,
  };
}

/**
 * Prefer the team model when it is confident, otherwise use the vision LLM.
 * While DishDetect's Indian heads are untrained, every result comes back unreliable, so this falls through to the LLM.
 */
export class FallbackFoodRecognizer implements FoodRecognizer {
  readonly id: string;
  constructor(private readonly primary: FoodRecognizer, private readonly fallback: FoodRecognizer) {
    this.id = `${primary.id}>${fallback.id}`;
  }

  async recognize(image: FoodImage, opts: { signal?: AbortSignal } = {}): Promise<FoodRecognition> {
    try {
      const r = await this.primary.recognize(image, opts);
      if (r.reliable && r.items.length > 0) return r;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
    }
    return this.fallback.recognize(image, opts);
  }
}
